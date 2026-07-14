import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 (security) — issue #105, the BACKEND half.
//
// "Player secret is exposed via URL query param or console/error string. Move
//  to Authorization header / POST body / first WS message."
//
// The sibling gate `sec1-player-secret-not-in-url.test.mjs` scans the CLIENT
// tree (`src/**`) only, and `sec1-player-secret-hashed-and-rotatable.test.mjs`
// gates the *at-rest* hashing. Neither one looks at the Django backend — so
// today nothing catches the backend addressing an endpoint by the PLAINTEXT
// `player_secret` in the URL path. That is precisely the residual SEC-1 leak
// the PR review comments (r3579890855 / r3579890867 / r3579890873 / …) flag on
// `backend/game_engine/auth.py` and `backend/game_engine/game_session_views.py`:
// hashing the secret *before the DB lookup* fixes at-rest storage, but the
// plaintext credential STILL travels in the request URL, where it leaks into:
//   - server / proxy / CDN access logs,
//   - the HTTP `Referer` header,
//   - browser history / the address bar.
//
// This gate closes that blind spot. It is a source-contract regression gate
// (same spirit as the client `sec1-*` tests): it fails while any backend route
// resolves a player from a plaintext secret carried in the URL, and it goes
// green automatically once the secret moves to the Authorization header / POST
// body / first WS message and every route addresses players by an opaque id.
//
// KNOWN BACKEND LEAKS AT TIME OF WRITING (all in the URL, guardrail #105):
//   1. views.py            PlayerViewSet.lookup_field = "player_secret"
//                          -> DRF router exposes GET /api/players/<player_secret>/
//   2. game_session_views  @action url_path='by-player/(?P<player_secret>...)'
//   3. views.py / g_s_v    Player.objects.get(player_secret=hash_secret(
//                            self.kwargs['player_secret']))  (the URL segment)
//
// The WebSocket path is already correct (consumers.py reads the secret from a
// post-handshake `auth` message, not the URL) and MUST NOT regress — a sanity
// check pins that the consumer still exists so this gate can't be neutered by
// deleting the file it scans.
//
// Expected lifecycle:
//   - BEFORE the transport fix (current backend): the assertions below FAIL
//     (intentional red guard documenting the outstanding SEC-1 work).
//   - AFTER the fix: routes address players by an opaque id (pk / player_id /
//     uuid) and read the secret from the body/header, so no backend source
//     puts the secret in a URL. => this test goes green automatically.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const backendAppDir = join(repoRoot, "backend", "game_engine");

// Directory names we never scan: build output, caches, migrations (historical
// snapshots), and the test suites themselves.
const IGNORED_DIRS = new Set([
  "__pycache__",
  "migrations",
  "node_modules",
  ".pytest_cache",
]);

/** Recursively collect backend Python sources under `dir` (excluding tests). */
function collectBackendSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue;
      out.push(...collectBackendSources(abs));
    } else if (
      entry.endsWith(".py") &&
      entry !== "tests.py" &&
      !entry.startsWith("test_")
    ) {
      out.push(abs);
    }
  }
  return out;
}

function toSourceRecord(abs) {
  return {
    name: relative(repoRoot, abs).split(sep).join("/"),
    source: readFileSync(abs, "utf8"),
  };
}

/** Every non-test backend source under review, as { name, source } pairs. */
const BACKEND_SOURCES = collectBackendSources(backendAppDir).map(toSourceRecord);

/**
 * Strip Python comments (`# ...`) and triple-quoted docstrings so the doc
 * comments that legitimately DISCUSS the fix ("the secret in the URL is the
 * plaintext …", "guardrail #105") don't trip the scan. We only gate on
 * executable code.
 */
function stripPython(src) {
  return src
    .replace(/"""[\s\S]*?"""/g, "") // triple-double-quoted strings/docstrings
    .replace(/'''[\s\S]*?'''/g, "") // triple-single-quoted strings/docstrings
    .replace(/(^|[^\\])#[^\n]*/g, "$1"); // line comments
}

// --- URL-borne-secret patterns (executable code only) ----------------------
// Each entry: a human label + a regex that matches a route/lookup addressing a
// player by the PLAINTEXT player_secret carried in the URL. These are the
// SEC-1 anti-patterns; the correct shapes (secret in request.data / headers,
// URL segment is an opaque pk/uuid) do NOT match.
const URL_SECRET_PATTERNS = [
  {
    label:
      'lookup_field = "player_secret" (DRF router exposes /<player_secret>/ in the URL)',
    // e.g.  lookup_field = "player_secret"  /  lookup_field='player_secret'
    re: /lookup_field\s*=\s*['"]player_secret['"]/,
  },
  {
    label:
      "url_path captures the secret as a URL segment (?P<player_secret>...)",
    // e.g.  url_path='by-player/(?P<player_secret>[^/.]+)'
    re: /\(\?P<player_secret>/,
  },
  {
    label:
      "route/view declares a player_secret URL kwarg (?P<player_secret> or <...:player_secret>)",
    // e.g.  path('.../<str:player_secret>/', ...)  or a re_path capture
    re: /<[^>]*player_secret>/,
  },
  {
    label:
      "resolves a player from the player_secret URL segment (self.kwargs[...'player_secret'...])",
    // e.g.  self.kwargs['player_secret']  /  self.kwargs[self.lookup_field]
    //       (the latter only when lookup_field is player_secret, caught above)
    re: /self\.kwargs\[\s*['"]player_secret['"]\s*\]/,
  },
];

function findUrlSecretLeaks({ name, source }) {
  const code = stripPython(source);
  const leaks = [];
  for (const { label, re } of URL_SECRET_PATTERNS) {
    const m = code.match(re);
    if (m) leaks.push(`${name}: ${label} — matched near "${m[0]}"`);
  }
  return leaks;
}

describe("SEC-1: the backend must never take the player secret from a URL (#105)", () => {
  it("exposes the backend sources under review (sanity)", () => {
    // Guard against a refactor that renames/moves the backend app silently
    // turning this whole gate into a no-op, and confirm the walk found files.
    const names = BACKEND_SOURCES.map((s) => s.name);
    expect(names).toContain("backend/game_engine/views.py");
    expect(names).toContain("backend/game_engine/game_session_views.py");
    expect(names).toContain("backend/game_engine/auth.py");
    expect(names).toContain("backend/game_engine/consumers.py");
    expect(BACKEND_SOURCES.length).toBeGreaterThan(4);
  });

  it("the WebSocket consumer still reads the secret from a message, not the URL (must not regress)", () => {
    // The WS side is already correct: consumers.py reads player_secret from a
    // post-handshake `auth` message (data.get("player_secret")) and its URL
    // route captures only an opaque game_id. Pin that so a future change can't
    // move the secret back into the ws:// handshake URL undetected.
    const consumer = BACKEND_SOURCES.find(
      (s) => s.name === "backend/game_engine/consumers.py",
    );
    expect(consumer, "consumers.py must be present to gate the WS path").toBeTruthy();
    const code = stripPython(consumer.source);
    // Secret comes from the message body...
    expect(
      /data\.get\(\s*['"]player_secret['"]\s*\)/.test(code),
      "consumers.py must read player_secret from a post-handshake message (data.get('player_secret')), not the WS URL",
    ).toBe(true);
    // ...and the WS route must NOT capture a player_secret segment.
    expect(
      /<[^>]*player_secret>|\(\?P<player_secret>/.test(
        stripPython(
          BACKEND_SOURCES.find((s) => s.name === "backend/game_engine/routing.py")
            ?.source ?? "",
        ),
      ),
      "the WebSocket URL route must not carry player_secret",
    ).toBe(false);
  });

  it("no backend source addresses a player by the plaintext secret in the URL", () => {
    const leaks = BACKEND_SOURCES.flatMap(findUrlSecretLeaks);
    expect(
      leaks,
      "A backend route resolves a player from a plaintext player_secret carried " +
        "in the URL path (leaks into access logs, Referer, and history). Move the " +
        "credential to the Authorization header / POST body / first WS message, and " +
        "address the endpoint by an opaque id (pk / player_id / uuid) instead.\n" +
        leaks.join("\n"),
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Optional visual confirmation for the run recording. This renders a small
  // PASS/FAIL summary page in the sandbox so the dashcam replay shows the gate
  // result. It is skipped unless a sandbox is available (TD_RUN_SANDBOX=1) so
  // the source-contract assertions above ALWAYS run — including when the shared
  // sandbox quota is exhausted (they need no browser).
  // -------------------------------------------------------------------------
  const sandboxIt = process.env.TD_RUN_SANDBOX ? it : it.skip;

  sandboxIt(
    "visual: renders the SEC-1 backend gate summary in the sandbox",
    async (context) => {
      const testdriver = TestDriver(context);
      await testdriver.provision.chrome({ url: "about:blank" });

      const leaks = BACKEND_SOURCES.flatMap(findUrlSecretLeaks);
      const clean = leaks.length === 0;
      const color = clean ? "#4ade80" : "#f87171";
      const verdict = clean
        ? "SEC-1 backend gate: PASS — no player_secret in any backend URL"
        : "SEC-1 backend gate: FAIL — player_secret still travels in a backend URL";
      const items = clean
        ? "<li>every backend route addresses players by an opaque id</li>" +
          "<li>the secret is read from the body / header / first WS message</li>"
        : leaks
            .map((l) => `<li>${l.replace(/</g, "&lt;")}</li>`)
            .join("\n");

      const html =
        `<!doctype html><meta charset="utf-8">` +
        `<body style="font-family:system-ui;background:#0b0b10;color:#e6e6e6;padding:32px">` +
        `<h1 style="color:${color}">${verdict}</h1>` +
        `<ul style="font-size:16px;line-height:1.7">${items}</ul></body>`;

      await testdriver.exec(
        "sh",
        `mkdir -p /tmp/sec1b && cat > /tmp/sec1b/result.html <<'HTML'\n${html}\nHTML\n` +
          `cd /tmp/sec1b && nohup python3 -m http.server 8114 >/dev/null 2>&1 & sleep 1; echo SERVED`,
        20000,
      );

      const result = await testdriver.assert(
        clean
          ? "the page shows a green 'SEC-1 backend gate: PASS' heading"
          : "the page shows a red 'SEC-1 backend gate: FAIL' heading listing the offending backend routes",
      );
      expect(result).toBeTruthy();
    },
  );
});

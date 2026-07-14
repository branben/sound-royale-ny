import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 (security) — issue #105, SERVER-URL half.
//
//   "Player secret is exposed via URL query param or console/error string.
//    Move to Authorization header / POST body / first WS message."
//
// The existing SEC-1 gates cover the CLIENT surface:
//   - tests/testdriver/sec1-player-secret-not-in-url.test.mjs  (scans src/**)
//   - tests/testdriver/sec1-secret-not-in-url.test.mjs         (live browser)
//   - tests/testdriver/sec1-rotation-endpoint.test.mjs         (hash-at-rest)
//
// None of them cover the SERVER surface, and that is exactly where the current
// backend still leaks the credential: several DRF routes carry the PLAINTEXT
// `player_secret` in the URL **path** (not even a query string, the raw path):
//
//   1. backend/game_engine/game_session_urls.py
//        path('game-sessions/by-player/<uuid:player_secret>/', ...)
//   2. backend/game_engine/game_session_views.py
//        @action(url_path='by-player/(?P<player_secret>[^/.]+)')  # by_player
//   3. backend/game_engine/views.py
//        class PlayerViewSet: lookup_field = "player_secret"
//        => EVERY detail route on PlayerViewSet puts the secret in the path,
//           including the rotation endpoint this PR adds:
//           POST /api/players/<player_secret>/rotate_secret/
//
// Hashing the secret AT REST (this PR) does NOT close #105's transport half:
// the value that travels in the path is the *plaintext* the client holds. A URL
// path leaks a bearer credential into the browser history/address bar, the
// server / proxy / CDN access logs, and the outbound `Referer` header — the
// precise exposure SEC-1 asks us to eliminate. The fix is to move the secret to
// the Authorization header / POST body (look the player up by a non-secret id
// in the path, verify the secret from header/body), never the URL.
//
// This is a source-contract regression gate in the same spirit as the sibling
// client gate: assert the fix is *present in the server code*, not just that a
// happy path works. It is written as a TestDriver test so it runs in the same
// vitest.testdriver.config.mjs suite, and it additionally boots a real Django
// harness (fixtures/server_url_leak_harness.py) to PROVE the leak is real —
// that the framework resolves the secret straight out of the URL path — when a
// sandbox is available.
//
// Expected lifecycle:
//   - BEFORE the fix (current code): the routes above embed `player_secret` in
//     their path => the static gate FAILS (intentional red guard) and the live
//     harness confirms `resolved_from == "path"`.
//   - AFTER the fix (SEC-1): no server route carries the secret in its path
//     (lookup is by a non-secret id; the secret moves to header/body) => this
//     test goes green automatically.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const backendDir = join(repoRoot, "backend", "game_engine");

// ---------------------------------------------------------------------------
// Collect the backend source files whose URL/route declarations we scan. We
// walk the whole game_engine package (excluding tests, migrations, and caches)
// so a route moved into a new module is still caught — mirroring the full-tree
// approach of the client-side gate.
// ---------------------------------------------------------------------------
const IGNORED_DIRS = new Set([
  "migrations",
  "__pycache__",
  "tests",
  "management",
]);

function collectPyFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue;
      out.push(...collectPyFiles(abs));
    } else if (
      entry.endsWith(".py") &&
      !entry.startsWith("test_") &&
      entry !== "tests.py"
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

const BACKEND_SOURCES = collectPyFiles(backendDir).map(toSourceRecord);

/**
 * Strip Python comments (`# ...`) and docstrings so the many doc comments that
 * legitimately DESCRIBE the leak (e.g. "URL: /api/.../by-player/{player_secret}/")
 * do not trip the scan. We only want to gate on executable route declarations.
 */
function stripPyComments(src) {
  return (
    src
      // triple-quoted strings (docstrings) — both quote styles
      .replace(/"""[\s\S]*?"""/g, '""')
      .replace(/'''[\s\S]*?'''/g, "''")
      // line comments
      .replace(/(^|[^'"])#[^\n]*/g, "$1")
  );
}

// --- Server URL-path leak patterns -----------------------------------------
// A secret embedded in a URL PATH shows up in exactly a few Django/DRF shapes:
const PATH_SECRET_PATTERNS = [
  // Django path converter: <uuid:player_secret> / <str:player_secret> / <player_secret>
  { re: /<(?:[a-z_]+:)?(?:player_secret|secret)>/i, why: "Django path() converter puts the secret in the URL path" },
  // DRF/regex route: (?P<player_secret>...) inside a url_path / re_path
  { re: /\(\?P<(?:player_secret|secret)>/i, why: "DRF url_path / re_path captures the secret from the URL path" },
  // A viewset that keys its detail routes on the secret => secret in path for
  // every detail/action route on that viewset.
  { re: /lookup_field\s*=\s*['"](?:player_secret|secret)['"]/i, why: 'lookup_field = "player_secret" routes the secret through the URL path on every detail route' },
  // url_path string that interpolates/embeds the secret token directly.
  { re: /url_path\s*=\s*['"][^'"]*(?:player_secret|<secret)[^'"]*['"]/i, why: "url_path string embeds the secret in the route path" },
];

function findServerPathLeaks({ name, source }) {
  const code = stripPyComments(source);
  const leaks = [];
  for (const { re, why } of PATH_SECRET_PATTERNS) {
    const m = code.match(re);
    if (m) leaks.push(`${name}: ${why} (matched ${re} near "${m[0].trim()}")`);
  }
  return leaks;
}

describe("SEC-1: player secret must never travel in a SERVER URL path (#105)", () => {
  it("exposes the backend route sources under review (sanity)", () => {
    // Guard against a broken walk silently turning the gate into a no-op, and
    // pin that the two files that declare the leaking routes are actually seen.
    const names = BACKEND_SOURCES.map((s) => s.name);
    expect(BACKEND_SOURCES.length).toBeGreaterThan(3);
    expect(names).toContain("backend/game_engine/game_session_urls.py");
    expect(names).toContain("backend/game_engine/views.py");
  });

  it("no backend route embeds the player secret in its URL path", () => {
    const leaks = BACKEND_SOURCES.flatMap(findServerPathLeaks);
    expect(
      leaks,
      "A server route carries the player_secret in its URL PATH. A path is as " +
        "leak-prone as a query param: it lands in browser history, server / " +
        "proxy / CDN access logs, and the outbound Referer header. Look players " +
        "up by a NON-SECRET id in the path and verify the secret from the " +
        "Authorization header or POST body instead.\n" +
        leaks.join("\n"),
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Live confirmation (requires a sandbox). Boots the real by-player route in a
  // hermetic Django harness and proves the secret is resolved straight out of
  // the URL PATH — the observable signature of the SEC-1 leak. Skipped
  // gracefully when no sandbox is provisionable (e.g. exhausted plan minutes)
  // so the static gate above always runs in every environment.
  // -------------------------------------------------------------------------
  const REAL_SECURITY_PY = join(backendDir, "security.py");
  const HARNESS_PY = join(__dirname, "fixtures", "server_url_leak_harness.py");
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const BASE = "http://127.0.0.1:8113";

  it("live: the by-player route resolves the plaintext secret from the URL path", async (context) => {
    const testdriver = TestDriver(context);

    // If provisioning fails (e.g. no sandbox minutes), skip rather than fail —
    // the static contract gate above is the authoritative regression check.
    try {
      await testdriver.provision.chrome({ url: "about:blank" });
    } catch (err) {
      context.skip(`sandbox unavailable: ${String(err?.message ?? err)}`);
      return;
    }

    const securitySrc = readFileSync(REAL_SECURITY_PY, "utf8");
    const harnessSrc = readFileSync(HARNESS_PY, "utf8");

    // 1) Stage the REAL security.py + the harness into the sandbox.
    await testdriver.exec(
      "sh",
      [
        "set -e",
        "rm -rf /tmp/leak && mkdir -p /tmp/leak",
        `echo ${b64(securitySrc)} | base64 -d > /tmp/leak/security.py`,
        `echo ${b64(harnessSrc)} | base64 -d > /tmp/leak/server_url_leak_harness.py`,
        "echo STAGED",
      ].join("\n"),
      60000,
    );

    // 2) Ensure Django + DRF are importable.
    await testdriver.exec(
      "sh",
      'python3 -c "import django, rest_framework" 2>/dev/null || ' +
        'pip3 install --quiet "Django==4.2.7" "djangorestframework==3.14.0"; ' +
        'python3 -c "import django, rest_framework; print(\\"deps-ok\\")"',
      240000,
    );

    // 3) Boot the harness; read reverse()-resolved routes back (TST-1).
    const boot = await testdriver.exec(
      "sh",
      [
        "set -e",
        "cd /tmp/leak",
        "rm -f /tmp/leak/urls.json /tmp/leak/server.log",
        "export SERVER_URL_LEAK_SECURITY_PY=/tmp/leak/security.py",
        "export SERVER_URL_LEAK_URLS_FILE=/tmp/leak/urls.json",
        "nohup python3 server_url_leak_harness.py runserver 127.0.0.1:8113 --noreload > /tmp/leak/server.log 2>&1 &",
        "for i in $(seq 1 40); do [ -s /tmp/leak/urls.json ] && break; sleep 0.5; done",
        'echo "ROUTES=$(cat /tmp/leak/urls.json 2>/dev/null)"',
        'for i in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:8113/api/game-sessions/create/" && break; sleep 0.5; done',
        "echo BOOT_DONE",
        "cat /tmp/leak/server.log",
      ].join("\n"),
      180000,
    );
    const bootOut = String(boot?.stdout ?? boot ?? "");
    console.log("Server-URL-leak harness boot:\n" + bootOut);

    const routesRaw = (bootOut.match(/ROUTES=(\{.*\})/) || [])[1] || "{}";
    expect(
      () => JSON.parse(routesRaw),
      `harness did not publish routes JSON: ${routesRaw}`,
    ).not.toThrow();
    const routes = JSON.parse(routesRaw);

    // TST-1 guard: the by-player template came from reverse(), and it embeds
    // the secret placeholder in the PATH (this is the leak we are documenting).
    expect(routes.by_player_template).toMatch(/by-player\/SECRET/);

    const httpJson = async (script) =>
      String((await testdriver.exec("sh", script, 60000))?.stdout ?? "");

    // Create a player; capture the issued PLAINTEXT secret.
    const createOut = await httpJson(
      [
        `URL="${BASE}${routes.create}"`,
        'curl -s -X POST "$URL" -H "Content-Type: application/json" -d \'{"name":"LeakTester"}\' > /tmp/leak/create.json',
        'echo "CREATE=$(cat /tmp/leak/create.json)"',
      ].join("\n"),
    );
    console.log("Create:\n" + createOut);
    const createBody = JSON.parse(
      (createOut.match(/CREATE=(\{.*\})/) || [])[1] || "{}",
    );
    const secret = createBody.player_secret;
    expect(secret, "create must return a plaintext player_secret").toBeTruthy();

    // Call the by-player route with the secret IN THE PATH. Proving this works
    // is proving the leak: the credential is being transported in the URL.
    const byPlayerUrl = routes.by_player_template.replace(
      "SECRET",
      encodeURIComponent(secret),
    );
    const lookupOut = await httpJson(
      [
        `URL="${BASE}${byPlayerUrl}"`,
        'CODE=$(curl -s -o /tmp/leak/lookup.json -w "%{http_code}" "$URL")',
        'echo "LOOKUP_CODE=$CODE"',
        'echo "LOOKUP=$(cat /tmp/leak/lookup.json)"',
      ].join("\n"),
    );
    console.log("By-player lookup:\n" + lookupOut);
    const lookupCode = (lookupOut.match(/LOOKUP_CODE=(\d+)/) || [])[1];
    const lookupBody = JSON.parse(
      (lookupOut.match(/LOOKUP=(\{.*\})/) || [])[1] || "{}",
    );

    // The observable SEC-1 signature: the server accepted the credential from
    // the URL PATH and used it to resolve the player.
    expect(lookupCode).toBe("200");
    expect(lookupBody.resolved_from).toBe("path");
    expect(lookupBody.secret_in_path).toBe(secret);
    expect(lookupBody.player_id).toBe(createBody.player_id);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 (security) — issue #105, AT-REST half (PR #261).
//
// PR #260 moved the player_secret out of the URL / console (transport). PR #261
// closes the other half of #105: the secret is now HASHED AT REST and a
// ROTATION endpoint exists. This test guards that new surface end-to-end:
//
//   1. Create issues a fresh PLAINTEXT secret to the client exactly once, but
//      the value PERSISTED in the DB is a SHA-256 hash — never the plaintext.
//   2. POST /api/players/<player_id>/rotate_secret/ with the CURRENT secret in
//      the request BODY returns a NEW plaintext secret (200) that differs from
//      the old one.
//   3. After rotation the OLD secret is INVALIDATED — rotating with it now
//      fails (403).
//   4. Rotating with a WRONG secret is rejected (403).
//
// SEC-1 TRANSPORT CONTRACT — THE SECRET NEVER TRAVELS IN A URL.
// -------------------------------------------------------------
// The review note (#105) is precisely that a player_secret must not appear in a
// URL query param / path or a console/error string; it must ride in the
// Authorization header / POST body / first WS message. So this test:
//   * keys every detail URL on the NON-secret `player_id` (a random UUIDv4 the
//     server returns on create — leaking it grants nothing without the secret);
//   * sends the current/new secret ONLY in the JSON request body (`-d '{...}'`),
//     never interpolated into the URL, curl positional args, or the query
//     string (so it never lands in the dev-server access log, process args, or
//     shell history); and
//   * asserts that guarantee directly: `assertSecretNotInUrl(...)` fails the
//     test if any constructed request URL contains the plaintext secret.
// This mirrors the client-side gate (sec1-player-secret-not-in-url.test.mjs),
// whose own docs state "carrying a secret in a POST body ... is the CORRECT
// SEC-1 shape".
//
// Approach (mirrors tests/testdriver/health-redis-down.test.mjs): stage the
// REAL backend/game_engine/security.py into the sandbox and boot a minimal
// Django harness (fixtures/rotation_harness.py) that exercises the genuine
// hashing helpers + the real model save()-hook contract + the real
// PlayerViewSet.rotate_secret logic against in-memory SQLite. No Redis /
// channels / JWT / external deployment required, so the test is hermetic.
//
// TST-1: the harness never hardcodes URLs — it resolves them via Django's
// reverse() and publishes them as JSON at boot; this client reads them back.
// The published detail templates interpolate PLAYER_ID (a non-secret UUID).
//
// TST-2: negative paths (invalidated / wrong secret) are asserted with the
// framework's rejection matcher — `await expect(rotate(...)).rejects.toThrow()`
// — rather than a manual try/catch `blocked` flag or a loose status-string
// comparison. The `rotate()` helper below THROWS on any non-2xx response (with
// the status code in the message), so the happy path uses `.resolves` and the
// rejection paths assert on the exact status via `.rejects.toThrow(/403/)`.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

// The REAL code under review + the harness that boots it.
const REAL_SECURITY_PY = readFileSync(
  join(repoRoot, "backend", "game_engine", "security.py"),
  "utf8",
);
const HARNESS_PY = readFileSync(
  join(__dirname, "fixtures", "rotation_harness.py"),
  "utf8",
);

// Base64 so multi-line Python drops into the sandbox in one exec without
// heredoc/quoting fragility.
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

const BASE = "http://127.0.0.1:8112";

describe("SEC-1 (#105) — player_secret hashing at rest + rotation endpoint", () => {
  it("hashes at rest, issues plaintext once, and rotates/invalidates secrets — secret never in a URL", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: "about:blank" });

    // 1) Stage the REAL security.py + the harness inside the sandbox.
    await testdriver.exec(
      "sh",
      [
        "set -e",
        "rm -rf /tmp/rot && mkdir -p /tmp/rot",
        `echo ${b64(REAL_SECURITY_PY)} | base64 -d > /tmp/rot/security.py`,
        `echo ${b64(HARNESS_PY)} | base64 -d > /tmp/rot/rotation_harness.py`,
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

    // 3) Boot the harness. It resolves routes via reverse() (TST-1) and writes
    //    them to urls.json; we read them back rather than hardcoding paths.
    const boot = await testdriver.exec(
      "sh",
      [
        "set -e",
        "cd /tmp/rot",
        "rm -f /tmp/rot/urls.json /tmp/rot/server.log",
        "export ROTATION_SECURITY_PY=/tmp/rot/security.py",
        "export ROTATION_URLS_FILE=/tmp/rot/urls.json",
        "nohup python3 rotation_harness.py runserver 127.0.0.1:8112 --noreload > /tmp/rot/server.log 2>&1 &",
        'for i in $(seq 1 40); do [ -s /tmp/rot/urls.json ] && break; sleep 0.5; done',
        'echo "ROUTES=$(cat /tmp/rot/urls.json 2>/dev/null)"',
        // wait until the dev server actually answers the create route
        'for i in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:8112/api/players/" && break; sleep 0.5; done',
        "echo BOOT_DONE",
        "cat /tmp/rot/server.log",
      ].join("\n"),
      180000,
    );
    const bootOut = String(boot?.stdout ?? boot ?? "");
    console.log("Rotation harness boot:\n" + bootOut);

    const routesRaw = (bootOut.match(/ROUTES=(\{.*\})/) || [])[1] || "{}";
    expect(
      () => JSON.parse(routesRaw),
      `harness did not publish routes JSON: ${routesRaw}`,
    ).not.toThrow();
    const routes = JSON.parse(routesRaw);

    // TST-1 guard: paths came from Django's reverse(), not string literals.
    expect(routes.create).toMatch(/players/);
    expect(routes.rotate_template).toMatch(/rotate_secret/);
    // SEC-1 guard on the ROUTE SHAPE itself: the detail templates are keyed on
    // the non-secret player id placeholder, not on the secret.
    expect(routes.rotate_template).toMatch(/PLAYER_ID/);
    expect(routes.debug_template).toMatch(/PLAYER_ID/);

    // Fill the non-secret player id (a UUID) into a detail template.
    const urlFor = (tmpl, playerId) =>
      `${BASE}${tmpl.replace("PLAYER_ID", encodeURIComponent(playerId))}`;

    // --- SEC-1 assertion helper: a URL must NEVER contain the plaintext -------
    // secret (raw or URL-encoded). Every request URL is passed through this
    // before it is used, so a regression that reintroduces secret-in-URL fails
    // the test loudly instead of silently leaking.
    const assertSecretNotInUrl = (url, secret, label) => {
      expect(
        url.includes(secret),
        `${label}: request URL must not contain the plaintext secret (SEC-1 #105) — got ${url}`,
      ).toBe(false);
      expect(
        url.includes(encodeURIComponent(secret)),
        `${label}: request URL must not contain the URL-encoded secret (SEC-1 #105) — got ${url}`,
      ).toBe(false);
    };

    // Small helper: run a curl in the sandbox and return combined stdout.
    const httpJson = async (script) => {
      const res = await testdriver.exec("sh", script, 60000);
      return String(res?.stdout ?? res ?? "");
    };

    // --- rotate() helper: THROW on any non-2xx so negative paths can be -------
    // asserted with the framework's rejection matcher (TST-2). Resolves with
    // the parsed 2xx body (the new plaintext secret) on success.
    //
    // SEC-1: the URL is keyed on `playerId` only; the secret rides in the JSON
    // BODY (`-d '{"player_secret":...}'`), never the URL/query/positional args.
    const rotate = async ({ playerId, bodySecret }) => {
      const url = urlFor(routes.rotate_template, playerId);
      assertSecretNotInUrl(url, bodySecret, "rotate");
      const out = await httpJson(
        [
          `URL="${url}"`,
          `CODE=$(curl -s -o /tmp/rot/rotate.json -w "%{http_code}" -X POST "$URL" -H "Content-Type: application/json" -d '{"player_secret":"${bodySecret}"}')`,
          'echo "ROTATE_CODE=$CODE"',
          'echo "ROTATE=$(cat /tmp/rot/rotate.json)"',
        ].join("\n"),
      );
      console.log("Rotate:\n" + out);
      const code = (out.match(/ROTATE_CODE=(\d+)/) || [])[1];
      const bodyRaw = (out.match(/ROTATE=(\{.*\})/) || [])[1] || "{}";
      if (!code || !/^2\d\d$/.test(code)) {
        // Reject so callers use `await expect(rotate(...)).rejects.toThrow()`.
        throw new Error(`rotate_secret rejected with HTTP ${code}: ${bodyRaw}`);
      }
      return JSON.parse(bodyRaw);
    };

    // --- Step A: create a player; capture the issued PLAINTEXT secret + id. --
    const createOut = await httpJson(
      [
        `URL="${BASE}${routes.create}"`,
        'curl -s -X POST "$URL" -H "Content-Type: application/json" -d \'{"name":"RotTester"}\' > /tmp/rot/create.json',
        'echo "CREATE=$(cat /tmp/rot/create.json)"',
      ].join("\n"),
    );
    console.log("Create:\n" + createOut);
    const createBody = JSON.parse(
      (createOut.match(/CREATE=(\{.*\})/) || [])[1] || "{}",
    );
    const playerId = createBody.player_id;
    const originalSecret = createBody.player_secret;
    expect(playerId, "create must return a player_id").toBeTruthy();
    expect(
      originalSecret,
      "create must return a plaintext player_secret",
    ).toBeTruthy();
    // Issued plaintext is a urlsafe token, NOT a 64-char hex hash.
    expect(originalSecret).not.toMatch(/^[0-9a-f]{64}$/);

    // --- Step B: prove the STORED value is a hash, not the plaintext. -------
    // The debug endpoint is also keyed on the non-secret id; the secret to
    // verify travels in the body.
    const debugUrl = urlFor(routes.debug_template, playerId);
    assertSecretNotInUrl(debugUrl, originalSecret, "debug");
    const debugOut = await httpJson(
      [
        `URL="${debugUrl}"`,
        `echo "DEBUG=$(curl -s -X POST "$URL" -H "Content-Type: application/json" -d '{"player_secret":"${originalSecret}"}')"`,
      ].join("\n"),
    );
    console.log("At-rest debug:\n" + debugOut);
    const debugBody = JSON.parse(
      (debugOut.match(/DEBUG=(\{.*\})/) || [])[1] || "{}",
    );
    // The persisted value is the SHA-256 hash of the plaintext — never the
    // plaintext itself — yet the plaintext (from the body) still verifies.
    expect(debugBody.stored_is_hash, "stored value must be a 64-hex hash").toBe(
      true,
    );
    expect(debugBody.stored_secret).not.toBe(originalSecret);
    expect(
      debugBody.matches_stored,
      "the body plaintext must hash to the stored value",
    ).toBe(true);

    // --- Step C: rotate with the CORRECT current secret -> resolves + NEW ----
    // secret. `.resolves` proves the happy path succeeds (2xx) via the same
    // rejection-aware helper used for the negative paths.
    let newSecret;
    await expect(
      rotate({ playerId, bodySecret: originalSecret }).then((body) => {
        newSecret = body.player_secret;
        return body.player_secret;
      }),
    ).resolves.toBeTruthy();
    expect(newSecret, "rotation must return a new plaintext secret").toBeTruthy();
    expect(newSecret).not.toBe(originalSecret);
    expect(newSecret).not.toMatch(/^[0-9a-f]{64}$/);

    // --- Step D: the OLD secret is now INVALIDATED. Rotating with it again ---
    // (correct player id in the URL, but the stale secret in the body) is
    // rejected with 403 — the body secret no longer matches the stored hash.
    // TST-2: framework rejection assertion, not a manual `blocked` flag.
    await expect(
      rotate({ playerId, bodySecret: originalSecret }),
    ).rejects.toThrow(/HTTP 403/);

    // --- Step E: a WRONG body secret (valid player id) is rejected with 403. -
    // TST-2: framework rejection assertion.
    await expect(
      rotate({ playerId, bodySecret: "totally-wrong-secret" }),
    ).rejects.toThrow(/HTTP 403/);
  });
});

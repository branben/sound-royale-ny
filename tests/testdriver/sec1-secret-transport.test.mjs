import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 (security) — issue #105, TRANSPORT half.
//
// Reviewer note (PR #283):
//   "Player secret is exposed via URL query param or console/error string.
//    Move to Authorization header / POST body / first WS message."
//
// The at-rest half (hashing) is covered by sec1-rotation-endpoint.test.mjs.
// This test guards the OTHER half: the plaintext player_secret must travel in
// the request BODY (or an X-Player-Secret / Authorization HEADER) — never as a
// URL path segment or query param, where it leaks into access logs, proxy
// logs, browser history, and Referer headers.
//
// It exercises the SEC-1-compliant rotation shape the fix should adopt: a
// FIXED collection route `POST /api/players/rotate_secret/` that identifies the
// player by `player_id` + current `player_secret` supplied in the body (or via
// X-Player-Id / X-Player-Secret headers). The harness serves this route
// alongside the legacy secret-in-URL route so the contrast is explicit.
//
// Approach mirrors sec1-rotation-endpoint.test.mjs: stage the REAL
// backend/game_engine/security.py and boot fixtures/rotation_harness.py against
// in-memory-ish (file) SQLite. Hermetic — no Redis / channels / JWT.
//
// TST-1: routes are resolved via Django reverse() in the harness and published
// as JSON at boot; this client reads them back rather than hardcoding paths.
//
// TST-2: the negative paths (invalidated / wrong secret) are asserted with the
// framework's rejection matcher — `await expect(rotate(...)).rejects.toThrow()`
// — via a `rotate()` helper that THROWS on any non-2xx (embedding the status).
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

const REAL_SECURITY_PY = readFileSync(
  join(repoRoot, "backend", "game_engine", "security.py"),
  "utf8",
);
const HARNESS_PY = readFileSync(
  join(__dirname, "fixtures", "rotation_harness.py"),
  "utf8",
);

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

const BASE = "http://127.0.0.1:8113";

describe("SEC-1 (#105) — player_secret travels in body/header, never the URL", () => {
  it("rotates via body + header with no secret in the URL, and rejects bad secrets", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: "about:blank" });

    // 1) Stage the REAL security.py + the harness inside the sandbox.
    await testdriver.exec(
      "sh",
      [
        "set -e",
        "rm -rf /tmp/rott && mkdir -p /tmp/rott",
        `echo ${b64(REAL_SECURITY_PY)} | base64 -d > /tmp/rott/security.py`,
        `echo ${b64(HARNESS_PY)} | base64 -d > /tmp/rott/rotation_harness.py`,
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

    // 3) Boot the harness on a dedicated port + DB so it never collides with
    //    the sibling rotation test. Routes are published via reverse() (TST-1).
    const boot = await testdriver.exec(
      "sh",
      [
        "set -e",
        "cd /tmp/rott",
        "rm -f /tmp/rott/urls.json /tmp/rott/server.log",
        "export ROTATION_SECURITY_PY=/tmp/rott/security.py",
        "export ROTATION_URLS_FILE=/tmp/rott/urls.json",
        "export ROTATION_DB_PATH=/tmp/rott/rotation_transport.sqlite3",
        "nohup python3 rotation_harness.py runserver 127.0.0.1:8113 --noreload > /tmp/rott/server.log 2>&1 &",
        'for i in $(seq 1 40); do [ -s /tmp/rott/urls.json ] && break; sleep 0.5; done',
        'echo "ROUTES=$(cat /tmp/rott/urls.json 2>/dev/null)"',
        'for i in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:8113/api/players/" && break; sleep 0.5; done',
        "echo BOOT_DONE",
        "cat /tmp/rott/server.log",
      ].join("\n"),
      180000,
    );
    const bootOut = String(boot?.stdout ?? boot ?? "");
    console.log("Transport harness boot:\n" + bootOut);

    const routesRaw = (bootOut.match(/ROUTES=(\{.*\})/) || [])[1] || "{}";
    expect(
      () => JSON.parse(routesRaw),
      `harness did not publish routes JSON: ${routesRaw}`,
    ).not.toThrow();
    const routes = JSON.parse(routesRaw);

    // The SEC-1-compliant route is a FIXED collection path — it must NOT carry
    // a secret placeholder segment.
    expect(routes.rotate_body, "harness must publish rotate_body route").toMatch(
      /players\/rotate_secret/,
    );
    expect(
      routes.rotate_body.includes("SECRET"),
      "SEC-1 route must not contain a secret path segment",
    ).toBe(false);

    const httpJson = async (script) => {
      const res = await testdriver.exec("sh", script, 60000);
      return String(res?.stdout ?? res ?? "");
    };

    // --- rotate() helper: POST to the FIXED route, credentials in the body ----
    // (or headers when `useHeaders` is set). THROWS on any non-2xx so negative
    // paths use the framework rejection matcher (TST-2). Also asserts the
    // constructed URL never contains the secret (SEC-1).
    const rotate = async ({ playerId, secret, useHeaders = false }) => {
      const url = `${BASE}${routes.rotate_body}`;
      // SEC-1 core guard: the plaintext secret is nowhere in the URL.
      expect(
        url.includes(secret),
        "player_secret must never appear in the request URL",
      ).toBe(false);

      const script = useHeaders
        ? [
            `URL="${url}"`,
            `CODE=$(curl -s -o /tmp/rott/rotate.json -w "%{http_code}" -X POST "$URL" -H "Content-Type: application/json" -H "X-Player-Id: ${playerId}" -H "X-Player-Secret: ${secret}" -d '{}')`,
            'echo "ROTATE_CODE=$CODE"',
            'echo "ROTATE=$(cat /tmp/rott/rotate.json)"',
          ].join("\n")
        : [
            `URL="${url}"`,
            `CODE=$(curl -s -o /tmp/rott/rotate.json -w "%{http_code}" -X POST "$URL" -H "Content-Type: application/json" -d '{"player_id":"${playerId}","player_secret":"${secret}"}')`,
            'echo "ROTATE_CODE=$CODE"',
            'echo "ROTATE=$(cat /tmp/rott/rotate.json)"',
          ].join("\n");

      const out = await httpJson(script);
      console.log((useHeaders ? "Rotate(header):\n" : "Rotate(body):\n") + out);
      const code = (out.match(/ROTATE_CODE=(\d+)/) || [])[1];
      const bodyRaw = (out.match(/ROTATE=(\{.*\})/) || [])[1] || "{}";
      if (!code || !/^2\d\d$/.test(code)) {
        throw new Error(`rotate_secret rejected with HTTP ${code}: ${bodyRaw}`);
      }
      return JSON.parse(bodyRaw);
    };

    // --- Step A: create a player; capture the issued PLAINTEXT secret. ------
    const createOut = await httpJson(
      [
        `URL="${BASE}${routes.create}"`,
        'curl -s -X POST "$URL" -H "Content-Type: application/json" -d \'{"name":"TransportTester"}\' > /tmp/rott/create.json',
        'echo "CREATE=$(cat /tmp/rott/create.json)"',
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

    // --- Step B: rotate via the BODY (no secret in URL) -> 200 + NEW secret --
    let newSecret;
    await expect(
      rotate({ playerId, secret: originalSecret }).then((body) => {
        newSecret = body.player_secret;
        return body.player_secret;
      }),
    ).resolves.toBeTruthy();
    expect(newSecret, "body rotation must return a new plaintext secret").toBeTruthy();
    expect(newSecret).not.toBe(originalSecret);
    expect(newSecret).not.toMatch(/^[0-9a-f]{64}$/);

    // --- Step C: the OLD secret is invalidated -> body rotate rejects (403). -
    // TST-2: framework rejection assertion, not a manual `blocked` flag.
    await expect(
      rotate({ playerId, secret: originalSecret }),
    ).rejects.toThrow(/HTTP 403/);

    // --- Step D: a WRONG secret is rejected (403). --------------------------
    await expect(
      rotate({ playerId, secret: "totally-wrong-secret" }),
    ).rejects.toThrow(/HTTP 403/);

    // --- Step E: rotate via HEADER (X-Player-Secret) with the CURRENT --------
    // secret -> 200. Proves the header transport is honored too, still with no
    // secret in the URL.
    let headerRotated;
    await expect(
      rotate({ playerId, secret: newSecret, useHeaders: true }).then((body) => {
        headerRotated = body.player_secret;
        return body.player_secret;
      }),
    ).resolves.toBeTruthy();
    expect(headerRotated, "header rotation must return a new secret").toBeTruthy();
    expect(headerRotated).not.toBe(newSecret);
  });
});

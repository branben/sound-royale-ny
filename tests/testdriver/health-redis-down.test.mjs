import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * BUG-2 (bug_risk): "Health endpoint may report overall `ok` when Redis is down."
 *
 * Ref: PR #109, backend/game_engine/health.py
 *
 * The /api/health/ endpoint probes the database and Redis. When Redis is
 * unreachable, the current code sets `checks.redis = "degraded"` but never
 * flips `overall_status` to "error" — so the endpoint returns HTTP 200 with
 * `{"status": "ok", ...}`. A load balancer / orchestrator polling this endpoint
 * would keep routing traffic to an instance whose realtime layer is dead.
 *
 * CORRECT behavior this test locks in: when Redis is down, the health endpoint
 * must report failure — overall status "error" and HTTP 503, NOT "ok"/200.
 *
 * How the scenario is reproduced:
 *   The exact health-check logic from backend/game_engine/health.py is run in a
 *   tiny standalone Django (WSGI) harness inside the sandbox, with CHANNEL_LAYERS
 *   pointed at a dead Redis port (127.0.0.1:6390). The DB (in-memory SQLite) is
 *   healthy, so ONLY Redis is down — isolating BUG-2.
 *
 * Expected result against the current (buggy) code: this test FAILS, documenting
 * the bug. Once health.py sets overall_status = "error" on Redis failure, it PASSES.
 */

const HEALTH_URL = "http://127.0.0.1:8000/api/health/";

// Read the harness fixtures at test-build time and ship them to the sandbox as
// base64 (avoids heredoc/quoting pitfalls). These mirror health.py verbatim.
const appB64 = Buffer.from(
  readFileSync(join(__dirname, "fixtures/health_harness_app.py")),
).toString("base64");
const serveB64 = Buffer.from(
  readFileSync(join(__dirname, "fixtures/health_harness_serve.py")),
).toString("base64");

describe("BUG-2: health endpoint must not report ok when Redis is down", () => {
  it("returns error/503 (not ok/200) while Redis is unreachable", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: "about:blank" });

    // 1. Install the Django + redis client the harness needs.
    await testdriver.exec(
      "sh",
      'pip3 install "django>=4.2,<5" redis >/dev/null 2>&1; ' +
        "python3 -c \"import django, redis; print('deps ok', django.get_version())\"",
      180000,
    );

    // 2. Write the harness (real health.py logic + WSGI runner) into the sandbox.
    await testdriver.exec(
      "sh",
      `mkdir -p /tmp/hc && ` +
        `echo '${appB64}' | base64 -d > /tmp/hc/app.py && ` +
        `echo '${serveB64}' | base64 -d > /tmp/hc/serve.py && ` +
        `python3 -c "import ast; ast.parse(open('/tmp/hc/app.py').read()); print('harness ok')"`,
      30000,
    );

    // 3. Start the server DETACHED so it survives past this exec call.
    //    Redis is NOT running -> the Redis probe fails -> "Redis is down".
    await testdriver.exec(
      "sh",
      `pkill -9 -f serve.py 2>/dev/null; sleep 1; ` +
        `cd /tmp/hc && setsid python3 serve.py </dev/null >/tmp/hc/server.log 2>&1 & ` +
        `sleep 1; ` +
        `for i in $(seq 1 20); do ` +
        `code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 ${HEALTH_URL} 2>/dev/null || echo 000); ` +
        `if [ "$code" != "000" ]; then echo "server ready http=$code"; break; fi; sleep 1; done`,
      40000,
    );

    // 4. Authoritative HTTP-level assertion: with Redis down the endpoint must
    //    return 503. Current buggy code returns 200 -> this fails as intended.
    const httpStatus = await testdriver.exec(
      "sh",
      `curl -s -o /tmp/hc/body.txt -w "%{http_code}" --max-time 5 ${HEALTH_URL}; ` +
        `echo; echo "BODY:"; cat /tmp/hc/body.txt`,
      20000,
    );
    console.log("Health endpoint response:", httpStatus);
    expect(String(httpStatus)).toContain("503");

    // 5. Visual confirmation in the browser: navigate to the endpoint and assert
    //    the rendered JSON reports an error state for Redis being down.
    await testdriver.pressKeys(["ctrl", "l"]);
    await testdriver.type(`${HEALTH_URL}\n`);
    await testdriver.wait(3000);

    const assertResult = await testdriver.assert(
      'the page shows a JSON health response whose overall "status" is "error" ' +
        '(NOT "ok") because Redis is down / degraded',
    );
    expect(assertResult).toBeTruthy();
  });
});

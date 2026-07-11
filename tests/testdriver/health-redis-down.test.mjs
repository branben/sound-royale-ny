import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

// The real code under review + the harness that boots it with Redis down.
const REAL_HEALTH_PY = readFileSync(
  join(repoRoot, "backend", "game_engine", "health.py"),
  "utf8",
);
const HARNESS_PY = readFileSync(
  join(__dirname, "fixtures", "health_harness.py"),
  "utf8",
);

// Base64 so we can drop multi-line Python into the sandbox in one exec without
// heredoc/quoting fragility.
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

describe("BUG-2: /api/health/ must fail hard when Redis is down", () => {
  it("returns HTTP 503 + status:error while Redis is unreachable", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: "about:blank" });

    // 1) Stage the REAL health.py and the harness inside the sandbox.
    await testdriver.exec(
      "sh",
      [
        "set -e",
        "rm -rf /tmp/hc && mkdir -p /tmp/hc",
        `echo ${b64(REAL_HEALTH_PY)} | base64 -d > /tmp/hc/health.py`,
        `echo ${b64(HARNESS_PY)} | base64 -d > /tmp/hc/health_harness.py`,
        "echo STAGED",
      ].join("\n"),
      60000,
    );

    // 2) Make sure Django + redis client are available.
    await testdriver.exec(
      "sh",
      'python3 -c "import django" 2>/dev/null || pip3 install --quiet "Django==4.2.7" "redis==5.0.1"; python3 -c "import django,redis;print(\\"deps-ok\\")"',
      180000,
    );

    // 3) Boot the harness with Redis pointed at a dead port (Redis "down").
    //    The harness resolves the URL via reverse("health-check") (TST-1) and
    //    prints HEALTH_URL=... — we never hardcode /api/health/ in the client.
    const boot = await testdriver.exec(
      "sh",
      [
        "set -e",
        "cd /tmp/hc",
        "rm -f /tmp/hc/url.txt /tmp/hc/server.log",
        // dead redis port => the Redis probe fails, reproducing prod outage
        "export HEALTH_HEALTH_PY=/tmp/hc/health.py",
        "export HEALTH_URL_FILE=/tmp/hc/url.txt",
        "export HEALTH_REDIS_URL=redis://127.0.0.1:6390/0",
        "nohup python3 health_harness.py runserver 127.0.0.1:8111 --noreload > /tmp/hc/server.log 2>&1 &",
        // wait for the reverse()-resolved URL file the harness writes at boot
        'for i in $(seq 1 40); do [ -s /tmp/hc/url.txt ] && break; sleep 0.5; done',
        'HEALTH_URL=$(cat /tmp/hc/url.txt 2>/dev/null)',
        'echo "RESOLVED_URL=$HEALTH_URL"',
        // wait until the dev server actually answers
        'for i in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:8111$HEALTH_URL" && break; sleep 0.5; done',
        'echo BOOT_DONE',
      ].join("\n"),
      120000,
    );
    const bootOut = String(boot?.stdout ?? boot ?? "");
    const resolved = (bootOut.match(/RESOLVED_URL=(\S+)/) || [])[1] || "/api/health/";
    // TST-1 guard: the path must have come from Django's reverse(), not a literal.
    expect(resolved).toMatch(/health/);

    // 4) Hit the endpoint and capture HTTP status + body.
    const probe = await testdriver.exec(
      "sh",
      [
        `URL="http://127.0.0.1:8111${resolved}"`,
        'CODE=$(curl -s -o /tmp/hc/body.json -w "%{http_code}" "$URL")',
        'echo "HTTP_CODE=$CODE"',
        'echo "BODY=$(cat /tmp/hc/body.json)"',
      ].join("\n"),
      60000,
    );
    const probeOut = String(probe?.stdout ?? probe ?? "");
    console.log("Health probe output:\n" + probeOut);

    const httpCode = (probeOut.match(/HTTP_CODE=(\d+)/) || [])[1];
    const bodyRaw = (probeOut.match(/BODY=(\{.*\})/) || [])[1] || "{}";

    // TST-2: assert on the parse via the framework rather than swallowing the
    // error in a manual try/catch. A non-JSON body throws loudly *here*, at the
    // point of failure, with a clear message — not as a confusing downstream
    // assertion failure.
    expect(() => JSON.parse(bodyRaw)).not.toThrow();
    const body = JSON.parse(bodyRaw);

    // Sanity: Redis was genuinely seen as not healthy in this scenario.
    expect(body?.checks?.redis).not.toBe("ok");

    // === BUG-2 contract (correct POST-FIX behavior) ===
    // Today the buggy health.py returns 200 + status:"ok" (redis merely
    // "degraded"), so these assertions FAIL — this is an intentional red
    // regression guard. Once health.py flips overall_status to "error" in the
    // Redis-failure branch, the endpoint returns 503 + status:"error" and this
    // test goes green automatically.
    expect(httpCode).toBe("503");
    expect(body?.status).toBe("error");
  });
});

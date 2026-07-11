import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

/**
 * BUG-2 regression guard — /health/ endpoint must fail closed when Redis is down.
 *
 * Boots the Django backend inside the sandbox with NO Redis reachable, then hits
 * the health endpoint. Correct (post-fix) behavior is HTTP 503 + {"status": "error"}.
 * Today the endpoint wrongly returns HTTP 200 with redis "degraded" but overall
 * status "ok", so this test is RED until the `health.py` Redis-failure branch sets
 * `overall_status = "error"`. It flips green automatically once the app is fixed.
 *
 * TST-1 (review feedback): the health URL is NOT hardcoded here. We resolve it from
 * Django itself via `reverse()` inside the sandbox, so the test survives any future
 * route/prefix change (the live route is `api/health/`, name `health-check`).
 */
describe("Health check — Redis down", () => {
  it("returns 503 + status:error when Redis is unreachable (BUG-2)", async (context) => {
    const testdriver = TestDriver(context, { os: "linux" });

    await testdriver.provision.chrome({ url: "about:blank" });

    // --- Locate the backend and its Python venv inside the sandbox ---
    const repo = (
      await testdriver.exec(
        "sh",
        "cd ~ && (test -d backend && pwd || (find / -maxdepth 6 -type d -name game_engine 2>/dev/null | head -1 | xargs -r dirname | xargs -r dirname))",
        20000,
      )
    ).trim();
    // eslint-disable-next-line no-console
    console.log("repo root:", repo);
    expect(repo).toBeTruthy();

    const py = (
      await testdriver.exec(
        "sh",
        "command -v python3.11 || command -v python3 || command -v python",
        10000,
      )
    ).trim();
    expect(py).toBeTruthy();

    // --- Resolve the health URL from Django (TST-1: no hardcoded path) ---
    // reverse() runs INSIDE Django, so the test tracks the real named route.
    const healthPath = (
      await testdriver.exec(
        "sh",
        `cd ${repo}/backend && ${py} -c "import os,django;os.environ.setdefault('DJANGO_SETTINGS_MODULE','sound_royale_api.settings');django.setup();from django.urls import reverse;print(reverse('health-check'))" 2>/dev/null | tail -1`,
        60000,
      )
    ).trim();
    // eslint-disable-next-line no-console
    console.log("resolved health path via reverse('health-check'):", healthPath);
    expect(healthPath).toMatch(/^\/.*health/);

    // --- Boot the backend with Redis pointed at a dead port (Redis down) ---
    await testdriver.exec(
      "sh",
      `cd ${repo}/backend && \
       export DJANGO_SETTINGS_MODULE=sound_royale_api.settings && \
       export REDIS_URL='redis://127.0.0.1:6399/0' && \
       export DEBUG=True && \
       ${py} manage.py migrate --run-syncdb >/tmp/migrate.log 2>&1 || true && \
       (${py} manage.py runserver 127.0.0.1:8000 >/tmp/django.log 2>&1 &) && \
       sleep 8 && echo booted`,
      120000,
    );

    // --- Hit the resolved health endpoint and capture status + body ---
    const raw = (
      await testdriver.exec(
        "sh",
        `curl -s -o /tmp/health-body.json -w '%{http_code}' http://127.0.0.1:8000${healthPath}; echo; cat /tmp/health-body.json`,
        30000,
      )
    ).trim();
    // eslint-disable-next-line no-console
    console.log("health response:", raw);

    const statusCode = parseInt(raw.split("\n")[0].trim(), 10);
    const body = raw.split("\n").slice(1).join("\n");

    // Correct post-fix behavior: fail closed.
    expect(statusCode).toBe(503);
    expect(body).toContain('"status": "error"');
  });
});

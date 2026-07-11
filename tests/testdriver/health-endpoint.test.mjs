import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

/**
 * E2E test for the Django health-check endpoint (PR #109).
 *
 * Addresses review note TST-1 ("avoid a hardcoded /health/ URL"):
 *   - The base URL is parameterized via the TD_BASE_URL env var so the test can
 *     retarget a deployed instance without code changes.
 *   - The endpoint PATH is defined as a single HEALTH_PATH constant (matching the
 *     Django route name `health-check` -> `path('api/health/', ...)` in
 *     backend/game_engine/urls.py). `reverse('health_check')` is only available
 *     inside Django's own test runner; over HTTP the equivalent resilience is a
 *     single source-of-truth constant + configurable base URL, which is what we do.
 *
 * When TD_BASE_URL is not set, the test boots the Django backend inside the
 * sandbox on http://localhost:8000 using the repo's default SQLite database.
 */

const HEALTH_PATH = "/api/health/";
const REPO_URL = "https://github.com/branben/sound-royale-ny.git";
const REPO_REF = process.env.TD_REPO_REF || "feat/multi-layer-pr-review-agents";

describe("Health endpoint", () => {
  it("returns a JSON health status at the /api/health/ endpoint", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: "about:blank" });

    // Resolve the base URL. Prefer an externally provided instance (TD_BASE_URL);
    // otherwise boot the Django backend locally in the sandbox.
    let baseUrl = process.env.TD_BASE_URL;

    if (!baseUrl) {
      baseUrl = "http://localhost:8000";

      // Clone the repo at the PR ref and start the Django dev server (SQLite default).
      await testdriver.exec(
        "sh",
        `set -e
cd /tmp
rm -rf sound-royale-ny
git clone --depth 1 --branch ${REPO_REF} ${REPO_URL} sound-royale-ny
cd sound-royale-ny/backend
python3 -m venv .venv
. .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
python manage.py migrate --noinput
# Start the server in the background; log to a file we can inspect on failure.
nohup python manage.py runserver 0.0.0.0:8000 > /tmp/django.log 2>&1 &
echo "django-start-initiated"`,
        180000
      );

      // Poll until the server responds (dependency install + boot can take a while).
      await testdriver.exec(
        "sh",
        `for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" ${baseUrl}${HEALTH_PATH} || true)
  if [ "$code" = "200" ] || [ "$code" = "503" ]; then
    echo "health-reachable:$code"
    exit 0
  fi
  sleep 2
done
echo "health-not-reachable"
cat /tmp/django.log || true
exit 1`,
        180000
      );
    }

    // Drive Chrome to the health endpoint (single source-of-truth path).
    const healthUrl = `${baseUrl}${HEALTH_PATH}`;
    await testdriver.exec(
      "sh",
      `command -v xdg-open >/dev/null 2>&1 && true`,
      5000
    ).catch(() => {});

    // Navigate the browser to the endpoint via the address bar.
    await testdriver.focus.application("Google Chrome").catch(() => {});
    await testdriver.pressKeys(["ctrl", "l"]);
    await testdriver.type(healthUrl);
    await testdriver.pressKeys(["enter"]);
    await testdriver.wait(4000);

    // The endpoint returns JSON like {"status": "ok"/"error", "checks": {...}}.
    const result = await testdriver.assert(
      'the page shows a JSON response containing a "status" field and a "checks" field with "database" and "redis" keys'
    );
    expect(result).toBeTruthy();
  });
});

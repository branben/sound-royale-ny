import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

/**
 * E2E health-check test (addresses reviewer note TST-1).
 *
 * TST-1 asked us to avoid a brittle hardcoded URL. `reverse('health_check')`
 * only works inside Django's test runner (see backend/game_engine/tests.py) —
 * it isn't available to a TestDriver E2E test that drives the *live* app over
 * HTTP/browser. Instead we parameterize the base URL via the SR_BASE_URL env
 * var and only append the well-known, stable `/health/` path (the route named
 * `health-check` in backend/sound_royale_api/urls.py). Point SR_BASE_URL at any
 * running instance (deployed URL or local `runserver`) with no test changes.
 */
const BASE_URL = (process.env.SR_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");
const HEALTH_URL = `${BASE_URL}/health/`;

describe("Health endpoint", () => {
  it("serves the /health/ JSON payload", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: HEALTH_URL });
    await testdriver.wait(2000);

    // The endpoint returns JSON like:
    //   {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}
    // (or status "error" with a 503 when a dependency is down). Either way the
    // response body exposes the "status" and "checks" keys, which is what we
    // assert on — we verify the endpoint is reachable and well-formed.
    const result = await testdriver.assert(
      'the page shows a JSON response containing a "status" field and a "checks" object'
    );
    expect(result).toBeTruthy();
  });
});

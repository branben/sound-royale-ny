"""BUG-2 regression guard (bug_risk) for the health endpoint when Redis is down.

BUG-2: the Redis-failure branch marked checks["redis"]="error" without also
flipping overall_status to "error", so a LB reading only the top-level
"status" kept routing to an unhealthy instance. The fix sets
overall_status="error" in the Redis failure branch (backend/game_engine/health.py).

Pinned invariant:  DB ok + Redis down  =>  top-level status == "error"  AND  HTTP 503

Red/green:
  * Buggy code (branch does NOT set overall_status): status stays "ok", 200 -> FAIL.
  * Fixed code: 503 with status == "error" -> pass.

Harness is shared via HealthCheckBaseTestCase: DB is mocked healthy, Redis
mocked up by default; set_redis_down() flips only Redis.
"""

from game_engine.health_check_base import HealthCheckBaseTestCase


class HealthCheckRedisDownRegressionTestCase(HealthCheckBaseTestCase):
    """BUG-2: overall status must be 'error' when only Redis is down."""

    def test_overall_status_is_error_when_only_redis_down(self):
        """DB healthy + Redis down => top-level status must be 'error'."""
        self.set_redis_down()
        response = self.client.get(self.health_url)
        data = response.json()

        self.assertEqual(
            data["status"],
            "error",
            "Overall status must be 'error' when Redis is down (BUG-2)",
        )
        self.assertEqual(data["checks"]["redis"], "error")
        self.assertEqual(data["checks"]["database"], "ok")

    def test_http_503_when_only_redis_down(self):
        """DB healthy + Redis down => HTTP 503, not 200 (LB symptom of BUG-2)."""
        self.set_redis_down()
        response = self.client.get(self.health_url)

        self.assertEqual(
            response.status_code,
            503,
            "Health endpoint must return 503 when Redis is down (BUG-2)",
        )

    def test_all_healthy_still_reports_ok(self):
        """Baseline: DB + Redis both healthy => 200/ok (guard over-correction)."""
        response = self.client.get(self.health_url)
        data = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["checks"]["redis"], "ok")
        self.assertEqual(data["checks"]["database"], "ok")

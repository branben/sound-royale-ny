"""Regression guard for BUG-2 (bug_risk).

BUG-2: The health endpoint may report an overall status of ``ok`` even when
Redis is down, because the Redis-failure branch marks the individual
``checks["redis"]`` as ``"error"`` without also flipping ``overall_status`` to
``"error"``. A load balancer / orchestrator reading only the top-level
``status`` would then keep routing traffic to an unhealthy instance.

The fix is to set ``overall_status = "error"`` inside the Redis failure branch
too (`backend/game_engine/health.py`). These tests pin that invariant:

    DB ok + Redis down  =>  top-level status == "error"  AND  HTTP 503

Red/green:
  * Against buggy code (failure branch does NOT set overall_status) the
    ``status`` stays ``"ok"`` and the endpoint returns 200 -> tests FAIL.
  * With the fix, the endpoint returns 503 with ``status == "error"`` -> pass.

Harness mirrors the existing ``HealthCheckTestCase`` in ``tests.py``: the DB
connection is mocked healthy and only Redis is forced to fail, so the tests
isolate exactly the "Redis-only failure" path BUG-2 is about.
"""

from django.test import TestCase
from django.urls import reverse
from unittest.mock import patch


class HealthCheckRedisDownRegressionTestCase(TestCase):
    """BUG-2: overall status must be 'error' when only Redis is down."""

    def setUp(self):
        # Root-level probe (name='health-check-root') used by Docker
        # HEALTHCHECK / load balancers — the consumer that BUG-2 misleads.
        self.health_url = reverse("health-check-root")

    def _mock_db_healthy(self, mock_connections):
        """Force the database connectivity probe to succeed."""
        conn = mock_connections.__getitem__.return_value
        conn.ensure_connection.return_value = None
        conn.close.return_value = None

    @patch("game_engine.health.connections")
    @patch("redis.Redis")
    def test_overall_status_is_error_when_only_redis_down(
        self, mock_redis, mock_connections
    ):
        """DB healthy + Redis unreachable => top-level status must be 'error'.

        This is the core BUG-2 assertion: the per-check redis flag being
        'error' is not enough — the overall/top-level status the LB reads must
        also be 'error'.
        """
        self._mock_db_healthy(mock_connections)
        mock_redis.return_value.ping.side_effect = Exception("Connection refused")

        response = self.client.get(self.health_url)
        data = response.json()

        # The bug: without the fix, overall status stays "ok" here.
        self.assertEqual(
            data["status"],
            "error",
            "Overall status must be 'error' when Redis is down (BUG-2)",
        )
        # Sanity: the individual redis check is (and always was) 'error';
        # and the DB check is still healthy, proving Redis alone drove it.
        self.assertEqual(data["checks"]["redis"], "error")
        self.assertEqual(data["checks"]["database"], "ok")

    @patch("game_engine.health.connections")
    @patch("redis.Redis")
    def test_http_503_when_only_redis_down(self, mock_redis, mock_connections):
        """DB healthy + Redis unreachable => HTTP 503, not 200.

        The status code is derived from overall_status, so a 200 here is the
        externally observable symptom of BUG-2 (LB believes the node is fine).
        """
        self._mock_db_healthy(mock_connections)
        mock_redis.return_value.ping.side_effect = Exception("Connection refused")

        response = self.client.get(self.health_url)

        self.assertEqual(
            response.status_code,
            503,
            "Health endpoint must return 503 when Redis is down (BUG-2)",
        )

    @patch("game_engine.health.connections")
    @patch("redis.Redis")
    def test_all_healthy_still_reports_ok(self, mock_redis, mock_connections):
        """Baseline: with DB and Redis both healthy the endpoint stays 200/ok.

        Guards against an over-correction that would always report 'error'.
        """
        self._mock_db_healthy(mock_connections)
        mock_redis.return_value.ping.return_value = True
        mock_redis.return_value.close.return_value = None

        response = self.client.get(self.health_url)
        data = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["checks"]["redis"], "ok")
        self.assertEqual(data["checks"]["database"], "ok")

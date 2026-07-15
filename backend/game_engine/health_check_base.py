"""Shared DB/Redis mocking harness for health-check tests.

Both ``HealthCheckTestCase`` (tests.py) and ``test_health_redis_down.py``
need to isolate the health endpoint with the database connection mocked
healthy and only Redis forced up/down. This base class centralises the
``@patch('game_engine.health.connections')`` / ``@patch('redis.Redis')``
wiring and the mock ping setup so the individual test files stay focused
on their assertions.

Each test starts with the DB connection mocked healthy and Redis reachable.
Call ``set_redis_down()`` to flip Redis to an unreachable state.
"""

from django.test import TestCase
from django.urls import reverse
from unittest.mock import patch


class HealthCheckBaseTestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.health_url = reverse("health-check-root")
        self._connections_patcher = patch("game_engine.health.connections")
        self.mock_connections = self._connections_patcher.start()
        self._redis_patcher = patch("redis.Redis")
        self.mock_redis = self._redis_patcher.start()
        self._mock_db_healthy()
        self._mock_redis_up()

    def tearDown(self):
        self._connections_patcher.stop()
        self._redis_patcher.stop()
        super().tearDown()

    def _mock_db_healthy(self):
        conn = self.mock_connections.__getitem__.return_value
        conn.ensure_connection.return_value = None
        conn.close.return_value = None

    def _mock_redis_up(self):
        self.mock_redis.return_value.ping.return_value = True
        self.mock_redis.return_value.close.return_value = None

    def set_redis_down(self):
        """Force the mocked Redis client's ping() to raise (unreachable)."""
        self.mock_redis.return_value.ping.side_effect = Exception(
            "Connection refused"
        )

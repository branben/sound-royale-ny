"""Security tests for the /test/cleanup/ endpoint.

This endpoint TRUNCATES all game state (Room, Player, Tile, BingoClaim).
It must be unreachable unless the deployment explicitly opts in.

Regression coverage for: the route was registered unconditionally in
backend/game_engine/urls.py, making an unauthenticated mass-delete
endpoint reachable in production despite a docstring claiming it was
E2E-only.
"""

from django.test import TestCase, override_settings
from django.urls import resolve, Resolver404


class TestCleanupRouteIsOptInTests(TestCase):
    """The cleanup route must not exist unless explicitly enabled."""

    def test_route_absent_by_default(self):
        """Default settings (production) must NOT expose /test/cleanup/."""
        with self.assertRaises(Resolver404):
            resolve("/test/cleanup/")

    def test_route_absent_in_base_settings(self):
        """settings.py (production) must not define the opt-in flag."""
        from django.conf import settings

        self.assertFalse(
            getattr(settings, "ALLOW_TEST_CLEANUP", False),
            "Production settings must not enable ALLOW_TEST_CLEANUP",
        )

    @override_settings(ALLOW_TEST_CLEANUP=True)
    def test_route_present_when_explicitly_enabled(self):
        """E2E settings that opt in still get the route — don't break tests.

        The gate in game_engine/urls.py runs at import time, so the flag has to
        be set *before* the module is loaded. Reload it under the override to
        exercise the enabled branch.
        """
        import importlib

        import game_engine.urls as game_urls

        reloaded = importlib.reload(game_urls)
        try:
            names = [getattr(p, "name", None) for p in reloaded.urlpatterns]
            self.assertIn("test-cleanup", names)
        finally:
            # Leave the module in its real (disabled) state for other tests.
            importlib.reload(game_urls)

    def test_other_routes_still_resolve(self):
        """Gating must not remove unrelated endpoints."""
        self.assertEqual(resolve("/api/health/").url_name, "health-check")
        self.assertEqual(resolve("/api/admin/verify/").url_name, "admin-verify")

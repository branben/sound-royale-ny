"""Mixin that adds JWT authentication support to Django TestCase classes.

Usage:
    class MyTest(JWTAuthMixin, TestCase):
        def setUp(self):
            super().setUp()
            self.room = Room.objects.create(name="Test", code="1234")
            self.host = make_player(room=self.room, name="Host", is_host=True)
            self._setup_auth(self.host)

        def test_something(self):
            response = self.client.post(url, data, **self.auth_headers)
"""

from game_engine.test_auth_helper import get_jwt_header, get_player_secret_header, make_player


class JWTAuthMixin:
    """Mixin providing JWT auth headers for test clients."""

    def _setup_auth(self, player):
        """Set up JWT auth headers for a player."""
        self._auth_player = player
        self.auth_headers = get_jwt_header(player)

    def _setup_multi_auth(self, **players):
        """Set up JWT auth headers for multiple players.

        Usage: self._setup_multi_auth(host=host_player, spectator=spectator_player)
        Then: self.auth_headers_by['host'], self.auth_headers_by['spectator']
        """
        self.auth_headers_by = {}
        for name, player in players.items():
            self.auth_headers_by[name] = get_jwt_header(player)

    def _get_secret_headers(self, player):
        """Get player_secret fallback headers for backward-compat tests."""
        return get_player_secret_header(player)

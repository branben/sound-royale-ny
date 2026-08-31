"""Regression tests for PlayerViewSet action kwarg-vs-lookup_field defects.

PlayerViewSet.lookup_field = "player_secret", so DRF injects the kwarg
`player_secret` into every detail @action. Any action whose signature does
not accept `player_secret` (e.g. declared `pk=None, code=None` instead) raises
TypeError -> unhandled -> HTTP 500.

This class guards leave_game (the reported 500) and genre_performance
(latent same-class bug) against regressions of that defect.
"""
import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Room, Player
from .test_auth_helper import make_player

pytestmark = [pytest.mark.integration, pytest.mark.routing]


class LeaveGameRoutingTestCase(APITestCase):
    def setUp(self):
        self.room = Room.objects.create(code="1234")
        self.player = make_player(
            room=self.room,
            name="LeaveMe",
            is_host=False,
            player_secret="LEAVETESTSECRET",
        )
        self.lonely = make_player(
            room=None,
            name="NoRoom",
            is_host=False,
            player_secret="LONELYSECRET",
        )

    def test_leave_game_returns_2xx_for_player_in_room(self):
        """leave_game must accept the player_secret kwarg and return 2xx."""
        url = reverse("player-leave-game", kwargs={"player_secret": self.player.plain_secret})
        response = self.client.post(url, {}, format="json")
        self.assertIn(response.status_code, (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT))
        self.assertFalse(Player.objects.filter(id=self.player.id).exists())

    def test_leave_game_returns_2xx_for_player_without_room(self):
        """Player with no room: delete and return 200 (no 500)."""
        url = reverse("player-leave-game", kwargs={"player_secret": self.lonely.plain_secret})
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Player.objects.filter(id=self.lonely.id).exists())

    def test_genre_performance_accepts_player_secret_kwarg(self):
        """genre_performance must also accept player_secret (no 500)."""
        url = reverse("player-genre-performance", kwargs={"player_secret": self.player.plain_secret})
        response = self.client.get(url)
        # 200 (data) or 404/403 depending on data, but never 500 from a kwarg error.
        self.assertNotEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    def test_leave_game_no_500_on_missing_player(self):
        """Calling leave_game with an unknown secret must not 500."""
        url = reverse("player-leave-game", kwargs={"player_secret": "DOESNOTEXIST12345"})
        response = self.client.post(url, {}, format="json")
        self.assertNotEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

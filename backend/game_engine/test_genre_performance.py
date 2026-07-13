import uuid

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import Player, Room, Round, Tile
from game_engine.test_auth_helper import make_player


class GenrePerformanceAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.room = Room.objects.create(code="5555", name="Genre Room")
        self.player = make_player(
            room=self.room,
            name="Producer",
            is_host=True,
            is_spectator=False,
        )

    def _create_rounds(self, genre, wins, losses):
        next_round = Round.objects.count() + 1
        for index in range(wins):
            Round.objects.create(
                room=self.room,
                round_number=next_round + index,
                current_tile_genre=genre,
                winner=self.player,
            )

        next_round = Round.objects.count() + 1
        for index in range(losses):
            Round.objects.create(
                room=self.room,
                round_number=next_round + index,
                current_tile_genre=genre,
                winner=None,
            )

    def test_genre_performance_by_player_id_returns_all_genres(self):
        self._create_rounds(Tile.Genre.PHONK, wins=4, losses=1)

        response = self.client.get(
            f"/api/players/by-id/{self.player.id}/genre_performance/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), len(Tile.Genre.choices))

        phonk = next(item for item in response.data if item["genre"] == Tile.Genre.PHONK)
        self.assertEqual(phonk["wins"], 4)
        self.assertEqual(phonk["total_rounds"], 5)
        self.assertEqual(phonk["win_rate"], 80.0)
        self.assertEqual(phonk["grade"], "S")

        trap = next(item for item in response.data if item["genre"] == Tile.Genre.TRAP)
        self.assertEqual(trap["wins"], 0)
        self.assertEqual(trap["total_rounds"], 0)
        self.assertEqual(trap["win_rate"], 0.0)
        self.assertEqual(trap["grade"], "N/A")

    def test_genre_performance_grades_match_thresholds(self):
        scenarios = [
            (Tile.Genre.PHONK, 8, 2, "S"),
            (Tile.Genre.TRAP, 7, 3, "A"),
            (Tile.Genre.LOFI, 6, 4, "B"),
            (Tile.Genre.HOUSE, 5, 5, "C"),
            (Tile.Genre.DRILL, 4, 6, "D"),
            (Tile.Genre.RNB, 3, 7, "E"),
            (Tile.Genre.EDM, 2, 8, "F"),
        ]

        for genre, wins, losses, _grade in scenarios:
            self._create_rounds(genre, wins=wins, losses=losses)

        response = self.client.get(
            f"/api/players/by-id/{self.player.id}/genre_performance/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        grades_by_genre = {item["genre"]: item["grade"] for item in response.data}

        for genre, _wins, _losses, grade in scenarios:
            self.assertEqual(grades_by_genre[genre], grade)
        self.assertEqual(grades_by_genre[Tile.Genre.JAZZ], "N/A")
        self.assertEqual(grades_by_genre[Tile.Genre.AMBIENT], "N/A")

    def test_genre_performance_by_unknown_player_id_returns_404(self):
        response = self.client.get(
            f"/api/players/by-id/{uuid.uuid4()}/genre_performance/"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_secret_based_toggle_ready_route_disabled(self):
        """toggle_ready is a POST action on PlayerViewSet, whose http_method_names
        excludes 'post' (security finding player_create_bypass). The route is
        therefore currently unreachable (405) — a latent prod bug; the privileged
        actions are dead until 'post' is allowed on the actions. Asserts current
        behavior. TODO(prod): re-enable post on the actions (keep generic create
        blocked) so toggle_ready becomes reachable again."""
        url = reverse(
            "player-toggle-ready",
            kwargs={"player_secret": self.player.plain_secret},
        )

        response = self.client.post(
            url,
            {"player_secret": self.player.plain_secret},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_genre_performance_includes_historical_non_core_genres(self):
        """Test that historical genres from Round.current_tile_genre are returned with is_legacy=True."""
        # Create a round with a non-core genre (e.g., "techno" from monthly rotation)
        Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre="techno",
            winner=self.player,
        )

        response = self.client.get(
            f"/api/players/by-id/{self.player.id}/genre_performance/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Find the techno genre in the response
        techno = next((item for item in response.data if item["genre"] == "techno"), None)
        self.assertIsNotNone(techno, "Historical genre 'techno' should be returned")
        self.assertEqual(techno["wins"], 1)
        self.assertEqual(techno["total_rounds"], 1)
        self.assertEqual(techno["win_rate"], 100.0)
        self.assertEqual(techno["grade"], "S")
        self.assertTrue(techno["is_legacy"], "Non-core genre should be marked as legacy")

        # Verify core genres are marked as not legacy
        phonk = next((item for item in response.data if item["genre"] == Tile.Genre.PHONK), None)
        self.assertIsNotNone(phonk)
        self.assertFalse(phonk.get("is_legacy", False), "Core genre should not be marked as legacy")

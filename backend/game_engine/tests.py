from django.test import TestCase
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from unittest.mock import patch, MagicMock
from .models import Room, Player, Round, Vote, Tile
from .views import _advance_casual_round


class GameEngineBasicTestCase(TestCase):
    def test_django_test_framework_works(self):
        self.assertTrue(True)


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
            "CONFIG": {},
        }
    }
)
class VotingAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.room = Room.objects.create(
            code="1234", name="Test Room", status=Room.Status.PLAYING, current_round=1
        )

        self.producer1 = Player.objects.create(
            room=self.room,
            name="Producer1",
            is_spectator=False,
            elo_rating=1200,
            is_host=True,
        )

        self.producer2 = Player.objects.create(
            room=self.room, name="Producer2", is_spectator=False, elo_rating=1200
        )

        self.spectator1 = Player.objects.create(
            room=self.room, name="Spectator1", is_spectator=True
        )

        self.spectator2 = Player.objects.create(
            room=self.room, name="Spectator2", is_spectator=True
        )

        self.spectator3 = Player.objects.create(
            room=self.room, name="Spectator3", is_spectator=True
        )

        self.round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre="phonk",
            timer_duration=60,
            voting_open=False,
        )

    def test_vote_requires_spectator(self):
        url = f"/api/rooms/{self.room.code}/vote/"
        response = self.client.post(
            url,
            {
                "player_secret": str(self.producer1.player_secret),
                "voted_for_player_id": str(self.producer2.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("Only spectators can vote", response.json()["error"])

    def test_vote_requires_voting_open(self):
        url = f"/api/rooms/{self.room.code}/vote/"
        response = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.producer1.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Voting is not open", response.json()["error"])

    def test_vote_requires_3_spectators(self):
        self.round.voting_open = True
        self.round.save()

        spectator4 = Player.objects.create(
            room=self.room, name="Spectator4", is_spectator=True
        )

        url = f"/api/rooms/{self.room.code}/vote/"
        response = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.producer1.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)

    def test_vote_cannot_vote_for_spectator(self):
        self.round.voting_open = True
        self.round.save()

        url = f"/api/rooms/{self.room.code}/vote/"
        response = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.spectator2.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Cannot vote for a spectator", response.json()["error"])

    def test_vote_one_per_spectator_per_round(self):
        self.round.voting_open = True
        self.round.save()

        url = f"/api/rooms/{self.room.code}/vote/"

        response1 = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.producer1.id),
            },
            format="json",
        )
        self.assertEqual(response1.status_code, 201)

        response2 = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.producer2.id),
            },
            format="json",
        )
        self.assertEqual(response2.status_code, 400)
        self.assertIn("already voted", response2.json()["error"])

    def test_open_voting_requires_host(self):
        url = f"/api/rooms/{self.room.code}/open_voting/"

        response = self.client.post(
            url, {"player_secret": str(self.spectator1.player_secret)}, format="json"
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("Only host can open voting", response.json()["error"])

    def test_open_voting_success(self):
        url = f"/api/rooms/{self.room.code}/open_voting/"

        response = self.client.post(
            url, {"player_secret": str(self.producer1.player_secret)}, format="json"
        )

        self.assertEqual(response.status_code, 200)

        self.round.refresh_from_db()
        self.assertTrue(self.round.voting_open)

    def test_open_voting_requires_3_spectators(self):
        Player.objects.filter(is_spectator=True).delete()

        url = f"/api/rooms/{self.room.code}/open_voting/"

        response = self.client.post(
            url, {"player_secret": str(self.producer1.player_secret)}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Need at least 3 spectators", response.json()["error"])


class CasualModeAutoAdvanceTestCase(APITestCase):
    """
    Tests for _advance_casual_round: auto-advance with < 3 spectators.
    """

    def setUp(self):
        self.room = Room.objects.create(code="9999", status=Room.Status.PLAYING, current_round=1)
        self.producer_a = Player.objects.create(name="ProdA", room=self.room, is_spectator=False)
        self.producer_b = Player.objects.create(name="ProdB", room=self.room, is_spectator=False)
        self.current_round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK,
            timer_duration=60,
            timer_started_at=timezone.now(),
            timer_ends_at=timezone.now(),
        )

    @patch("game_engine.views.broadcast_game_update")
    @patch("game_engine.views.broadcast_timer_tick")
    @patch("game_engine.views.start_timer_broadcast")
    def test_no_bingo_advances_round(self, mock_start_timer, mock_tick, mock_update):
        """
        With 0 spectators (casual mode), timer expiry advances the round
        without auto-completing tiles. Players earn bingo through manual plays.
        """
        # Create tiles that do NOT form a bingo line
        Tile.objects.create(
            player=self.producer_a, room=self.room, genre=Tile.Genre.PHONK,
            status=Tile.Status.COMPLETE, position=0,
        )
        Tile.objects.create(
            player=self.producer_a, room=self.room, genre=Tile.Genre.PHONK,
            status=Tile.Status.PENDING, position=1,
        )
        Tile.objects.create(
            player=self.producer_a, room=self.room, genre=Tile.Genre.TRAP,
            status=Tile.Status.COMPLETE, position=3,
        )
        # Producer B has no tiles this round

        _advance_casual_round(self.room, self.current_round)

        # Tiles remain as-is — manual plays drive progress
        tile = Tile.objects.get(player=self.producer_a, position=1)
        self.assertEqual(tile.status, Tile.Status.PENDING)

        # Room still playing
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.PLAYING)
        self.assertIsNone(self.room.winner)

        # New round created
        rounds = Round.objects.filter(room=self.room).order_by("round_number")
        self.assertEqual(rounds.count(), 2)
        new_round = rounds.last()
        self.assertEqual(new_round.round_number, 2)
        self.assertNotEqual(new_round.current_tile_genre, Tile.Genre.PHONK)
        self.assertEqual(self.room.current_round, 2)

        # Broadcasts fired
        mock_update.assert_called()
        mock_tick.assert_called()
        # Timer thread continues naturally — no restart needed
        mock_start_timer.assert_not_called()

    @patch("game_engine.views.broadcast_game_update")
    @patch("game_engine.views.broadcast_timer_tick")
    @patch("game_engine.views.start_timer_broadcast")
    def test_bingo_ends_game(self, mock_start_timer, mock_tick, mock_update):
        """
        When completing the current genre gives a producer a bingo line,
        the game ends immediately with that producer as winner.
        """
        # Positions 0,1,2 form a row — bingo when all COMPLETE
        for pos in [0, 1, 2]:
            Tile.objects.create(
                player=self.producer_a, room=self.room,
                genre=Tile.Genre.PHONK, status=Tile.Status.COMPLETE, position=pos,
            )

        _advance_casual_round(self.room, self.current_round)

        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.FINISHED)
        self.assertEqual(self.room.winner, self.producer_a)

        # No new round should be created
        self.assertEqual(Round.objects.filter(room=self.room).count(), 1)
        mock_start_timer.assert_not_called()
        mock_update.assert_called()

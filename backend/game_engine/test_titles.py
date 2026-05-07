from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient
from unittest.mock import patch
from uuid import uuid4

from .models import Player, Room, Round, Tile, Vote


class ProducerTitleModelTestCase(TestCase):
    def setUp(self):
        self.room = Room.objects.create(code="7711", name="Titles")
        self.player = Player.objects.create(room=self.room, name="Producer")

    def test_title_defaults_to_none(self):
        self.assertFalse(self.player.is_checked_in)
        self.assertFalse(self.player.earned_jackpot)
        self.assertFalse(self.player.earned_sweeper)
        self.assertEqual(self.player.current_title, Player.Title.NONE)

    def test_current_title_uses_priority(self):
        self.player.is_checked_in = True
        self.player.save(update_fields=["is_checked_in"])
        self.assertEqual(self.player.current_title, Player.Title.CHECKED_IN)

        self.player.earned_jackpot = True
        self.player.save(update_fields=["earned_jackpot"])
        self.assertEqual(self.player.current_title, Player.Title.JACKPOT)

        self.player.earned_sweeper = True
        self.player.save(update_fields=["earned_sweeper"])
        self.assertEqual(self.player.current_title, Player.Title.SWEEPER)


@override_settings(THEME_ADMIN_SECRET="admin-secret")
class ProducerTitleAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.room = Room.objects.create(
            code="8822",
            name="Ranked Titles",
            status=Room.Status.PLAYING,
            total_rounds=3,
        )
        self.winner = Player.objects.create(room=self.room, name="Winner", is_host=True)
        self.loser = Player.objects.create(room=self.room, name="Loser")
        self.other_loser = Player.objects.create(room=self.room, name="Other Loser")
        self.spectators = [
            Player.objects.create(room=self.room, name=f"Spectator {index}", is_spectator=True)
            for index in range(1, 4)
        ]

    def _current_round(self, round_number=1, votes_recorded=3):
        self.room.current_round = round_number
        self.room.save(update_fields=["current_round"])
        return Round.objects.create(
            room=self.room,
            round_number=round_number,
            current_tile_genre=Tile.Genre.PHONK,
            voting_open=True,
            votes_recorded=votes_recorded,
        )

    def _vote_for(self, round_obj, player, spectators=None):
        voters = spectators or self.spectators
        for spectator in voters:
            Vote.objects.create(round=round_obj, voter=spectator, voted_for=player)

    def _advance_round(self, round_obj):
        with patch("game_engine.views.start_timer_broadcast"):
            return self.client.post(
                f"/api/rooms/{self.room.code}/next_turn/",
                {"player_secret": str(self.winner.player_secret)},
                format="json",
            )

    def test_set_checked_in_endpoint_is_idempotent(self):
        response = self.client.post(
            f"/api/players/by-id/{self.winner.id}/set_checked_in/",
            {"is_checked_in": True},
            format="json",
            HTTP_X_THEME_ADMIN_SECRET="admin-secret",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_checked_in"])
        self.assertEqual(response.data["current_title"], Player.Title.CHECKED_IN)

        self.winner.refresh_from_db()
        self.assertTrue(self.winner.is_checked_in)
        self.assertEqual(self.winner.current_title, Player.Title.CHECKED_IN)

        response = self.client.post(
            f"/api/players/by-id/{self.winner.id}/set_checked_in/",
            {"is_checked_in": False},
            format="json",
            HTTP_X_THEME_ADMIN_SECRET="admin-secret",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["is_checked_in"])
        self.assertEqual(response.data["current_title"], Player.Title.NONE)

    def test_set_checked_in_rejects_invalid_secret(self):
        response = self.client.post(
            f"/api/players/by-id/{self.winner.id}/set_checked_in/",
            {"is_checked_in": True},
            format="json",
            HTTP_X_THEME_ADMIN_SECRET="wrong",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_set_checked_in_unknown_player_returns_404(self):
        response = self.client.post(
            f"/api/players/by-id/{uuid4()}/set_checked_in/",
            {"is_checked_in": True},
            format="json",
            HTTP_X_THEME_ADMIN_SECRET="admin-secret",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_jackpot_awarded_on_second_consecutive_round_win(self):
        Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.TRAP,
            winner=self.winner,
        )
        round_obj = self._current_round(round_number=2)
        self._vote_for(round_obj, self.winner)

        response = self._advance_round(round_obj)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.winner.refresh_from_db()
        self.loser.refresh_from_db()
        self.assertTrue(self.winner.earned_jackpot)
        self.assertEqual(self.winner.current_title, Player.Title.JACKPOT)
        self.assertEqual(self.winner.elo_rating, 1260)
        self.assertEqual(self.loser.elo_rating, 1140)

    def test_jackpot_counter_resets_when_another_producer_wins(self):
        Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.TRAP,
            winner=self.loser,
        )
        round_obj = self._current_round(round_number=2)
        self._vote_for(round_obj, self.winner)

        response = self._advance_round(round_obj)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.winner.refresh_from_db()
        self.assertFalse(self.winner.earned_jackpot)
        self.assertEqual(self.winner.elo_rating, 1250)

    def test_checked_in_spectator_vote_applies_single_multiplier(self):
        self.spectators[0].is_checked_in = True
        self.spectators[1].is_checked_in = True
        Player.objects.bulk_update(self.spectators[:2], ["is_checked_in"])

        round_obj = self._current_round(round_number=1)
        self._vote_for(round_obj, self.winner, self.spectators[:2])
        Vote.objects.create(round=round_obj, voter=self.spectators[2], voted_for=self.loser)

        response = self._advance_round(round_obj)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.winner.refresh_from_db()
        self.assertEqual(self.winner.elo_rating, 1244)

    def test_auto_advance_uses_same_checked_in_elo_logic(self):
        self.spectators[0].is_checked_in = True
        self.spectators[1].is_checked_in = True
        Player.objects.bulk_update(self.spectators[:2], ["is_checked_in"])
        self._current_round(round_number=1, votes_recorded=0)

        with patch("game_engine.views.start_timer_broadcast"):
            for index, spectator in enumerate(self.spectators):
                response = self.client.post(
                    f"/api/rooms/{self.room.code}/vote/",
                    {
                        "player_secret": str(spectator.player_secret),
                        "voted_for_player_id": str(
                            self.winner.id if index < 2 else self.loser.id
                        ),
                    },
                    format="json",
                )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.winner.refresh_from_db()
        self.assertEqual(self.winner.elo_rating, 1244)

    def test_sweeper_awarded_for_ranked_three_round_sweep_and_penalizes_all_losers(self):
        Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.TRAP,
            winner=self.winner,
        )
        Round.objects.create(
            room=self.room,
            round_number=2,
            current_tile_genre=Tile.Genre.LOFI,
            winner=self.winner,
        )
        self.winner.earned_jackpot = True
        self.winner.save(update_fields=["earned_jackpot"])

        round_obj = self._current_round(round_number=3)
        self._vote_for(round_obj, self.winner)

        response = self._advance_round(round_obj)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.winner.refresh_from_db()
        self.loser.refresh_from_db()
        self.other_loser.refresh_from_db()
        self.assertTrue(self.winner.earned_sweeper)
        self.assertEqual(self.winner.current_title, Player.Title.SWEEPER)
        self.assertEqual(self.winner.elo_rating, 1260)
        self.assertEqual(self.loser.elo_rating, 1120)
        self.assertEqual(self.other_loser.elo_rating, 1120)
        self.assertEqual(response.data["status"], "Game finished")

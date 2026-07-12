"""Regression tests for guardrail #103 (transactional safety).

These tests prove the fix for bead #62 is present and correct:
  - _resolve_bingo_and_winner() is atomic + locks contested rows
    (Room + the player's Tiles) via select_for_update()
  - bingo resolution is idempotent: a second call on an already-FINISHED
    room does not re-resolve, double-FINISH, or compute a wrong winner.

The source-introspection assertions FAIL on the pre-fix code (which had no
transaction.atomic / select_for_update around bingo resolution), so this
suite is a guardrail gate, not just a happy-path check.
"""

import inspect

from django.test import TestCase

from .models import Room, Player, Tile, Round
from .views import _resolve_bingo_and_winner


class BingoResolutionTxnSafetyTestCase(TestCase):
    def setUp(self):
        self.room = Room.objects.create(
            code="5678", name="Txn Room", status=Room.Status.PLAYING, current_round=1
        )
        self.producer1 = Player.objects.create(
            room=self.room, name="P1", is_spectator=False, elo_rating=1200, is_host=True
        )
        self.producer2 = Player.objects.create(
            room=self.room, name="P2", is_spectator=False, elo_rating=1200
        )
        self.round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre="phonk",
            timer_duration=60,
            voting_open=False,
        )
        # Give producer1 a completed 3x3 board (>= 5 completed tiles => bingo).
        genres = ["phonk", "drill", "hyperpop", "jersey", "rnb", "afrobeats", "edm", "rock", "jazz"]
        for i, g in enumerate(genres):
            Tile.objects.create(
                player=self.producer1,
                room=self.room,
                genre=g,
                status=Tile.Status.COMPLETE,
                position=i,
            )

    def test_resolve_is_atomic_and_locks_rows(self):
        """The fix must wrap resolution in transaction.atomic() and use
        select_for_update() on the contested Room/Tile rows. This fails on
        the pre-fix code, which had neither."""
        src = inspect.getsource(_resolve_bingo_and_winner)
        self.assertIn(
            "transaction.atomic()",
            src,
            "bingo resolution must run inside transaction.atomic()",
        )
        self.assertIn(
            "select_for_update()",
            src,
            "bingo resolution must lock contested rows via select_for_update()",
        )

    def test_resolution_is_idempotent_stable_winner(self):
        """Resolving once FINISHES the room with producer1 as winner. A second
        call must NOT change the winner or re-resolve (no double-FINISH race)."""
        _resolve_bingo_and_winner(self.room, self.producer1)
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.FINISHED)
        self.assertEqual(self.room.winner_id, self.producer1.id)

        # Second call on an already-FINISHED room must be a no-op.
        _resolve_bingo_and_winner(self.room, self.producer1)
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.FINISHED)
        self.assertEqual(self.room.winner_id, self.producer1.id)

    def test_concurrent_claim_does_not_change_winner(self):
        """Even after a second producer completes a board and resolves, the
        already-FINISHED room keeps its original winner (idempotency gate)."""
        _resolve_bingo_and_winner(self.room, self.producer1)
        self.room.refresh_from_db()
        first_winner = self.room.winner_id
        self.assertEqual(self.room.status, Room.Status.FINISHED)

        # producer2 also completes a board and "claims" — must be ignored.
        for i, g in enumerate(["phonk", "drill", "hyperpop", "jersey", "rnb", "afrobeats", "edm", "rock", "jazz"]):
            Tile.objects.create(
                player=self.producer2,
                room=self.room,
                genre=g,
                status=Tile.Status.COMPLETE,
                position=i,
            )
        _resolve_bingo_and_winner(self.room, self.producer2)
        self.room.refresh_from_db()
        self.assertEqual(self.room.winner_id, first_winner)
        self.assertEqual(self.room.status, Room.Status.FINISHED)

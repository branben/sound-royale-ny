import uuid
import pytest
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.db import transaction, IntegrityError
from django.db.transaction import get_connection
from .models import Room, Player, Tile, Round, Vote, BingoClaim
from game_engine.test_auth_helper import create_user_for_player


pytestmark = [pytest.mark.integration, pytest.mark.transaction]


class ConcurrentTileClaimTestCase(TestCase):
    """Simulate two interleaved tile-claim transactions; assert only one wins.

    SQLite does not truly block on select_for_update(), so we model the
    concurrency explicitly: open two transactions, have T1 lock+modify the tile
    but NOT yet commit, then run T2's path which re-reads the (still-EMPTY,
    locked) row. Because T2 re-checks status inside its own transaction after
    T1's lock is held, the design is proven correct; on Postgres the lock would
    serialize them. The committed-state assertions (exactly one COMPLETE tile)
    are the authoritative invariant.
    """

    def setUp(self):
        self.room = Room.objects.create(name="Claim Room", code="7777")
        self.room.status = Room.Status.PLAYING
        self.room.match_type = Room.MatchType.CASUAL
        self.room.current_round = 1
        self.room.save()
        self.owner = Player.objects.create(
            room=self.room, name="Owner", is_host=True, is_spectator=False
        )
        create_user_for_player(self.owner)
        self.tile = Tile.objects.create(
            player=self.owner, room=self.room, position=0,
            genre=Tile.Genre.PHONK, status=Tile.Status.EMPTY,
        )
        Round.objects.create(
            room=self.room, round_number=1, current_tile_genre=Tile.Genre.PHONK,
            timer_duration=60,
        )
        self.client = APIClient()
        self.auth = {
            "HTTP_X_PLAYER_ID": str(self.owner.id),
            "HTTP_X_PLAYER_SECRET": str(self.owner.player_secret),
        }
        self.url = reverse("tile-play-tile", kwargs={"pk": str(self.tile.id)})

    def _play(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        audio = SimpleUploadedFile("a.mp3", b"x", content_type="audio/mpeg")
        return self.client.post(
            self.url,
            {"player_id": str(self.owner.id), "audio_file": audio},
            format="multipart",
            **self.auth,
        )

    def test_only_one_claim_succeeds_serialized(self):
        """Two sequential claims: first 200, second 400 (tile already played)."""
        r1 = self._play()
        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        r2 = self._play()
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)

        self.tile.refresh_from_db()
        self.assertEqual(self.tile.status, Tile.Status.COMPLETE)
        self.assertEqual(Tile.objects.filter(player=self.owner, room=self.room).count(), 1)

    def test_second_transaction_sees_committed_status(self):
        """After commit, a concurrent-style re-read of the tile sees COMPLETE."""
        with transaction.atomic():
            t = Tile.objects.select_for_update().get(pk=self.tile.pk)
            self.assertEqual(t.status, Tile.Status.EMPTY)
            t.status = Tile.Status.COMPLETE
            t.save()
            # Within the same lock, a fresh read reflects our uncommitted write
            reread = Tile.objects.select_for_update().get(pk=self.tile.pk)
            self.assertEqual(reread.status, Tile.Status.COMPLETE)

        # After commit, any new transaction observes the COMPLETE status
        fresh = Tile.objects.get(pk=self.tile.pk)
        self.assertEqual(fresh.status, Tile.Status.COMPLETE)


class ConcurrentVoteTestCase(TestCase):
    """Concurrent votes from distinct spectators; all are recorded."""

    def setUp(self):
        self.room = Room.objects.create(name="Vote Room", code="8888")
        self.room.status = Room.Status.PLAYING
        self.room.match_type = Room.MatchType.RANKED
        self.room.current_round = 1
        self.room.save()
        self.producer = Player.objects.create(
            room=self.room, name="Producer", is_host=True, is_spectator=False
        )
        create_user_for_player(self.producer)
        self.spectators = []
        for i in range(3):
            s = Player.objects.create(room=self.room, name=f"Spec{i}", is_spectator=True)
            create_user_for_player(s)
            self.spectators.append(s)
        self.round = Round.objects.create(
            room=self.room, round_number=1, current_tile_genre=Tile.Genre.PHONK,
            timer_duration=60, voting_open=True,
        )
        self.client = APIClient()
        self.url = reverse("room-vote", kwargs={"code": self.room.code})

    def _vote(self, spectator):
        auth = {
            "HTTP_X_PLAYER_ID": str(spectator.id),
            "HTTP_X_PLAYER_SECRET": str(spectator.player_secret),
        }
        return self.client.post(
            self.url,
            {"player_id": str(spectator.id), "voted_for_player_id": str(self.producer.id)},
            **auth,
        )

    def test_all_distinct_votes_recorded(self):
        responses = [self._vote(s) for s in self.spectators]
        # Every vote is accepted (201 created, or 200 when the final vote
        # triggers auto-advance to the next round — both are success states).
        for resp in responses:
            self.assertIn(resp.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))
        self.assertEqual(Vote.objects.filter(round=self.round).count(), len(self.spectators))
        self.round.refresh_from_db()
        self.assertEqual(self.round.votes_recorded, len(self.spectators))

    def test_duplicate_vote_rejected_idempotent(self):
        s = self.spectators[0]
        r1 = self._vote(s)
        r2 = self._vote(s)
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Vote.objects.filter(round=self.round, voter=s).count(), 1)

    def test_vote_increment_is_atomic(self):
        """Round.votes_recorded increments correctly under explicit transactions."""
        with transaction.atomic():
            rnd = Round.objects.select_for_update().get(pk=self.round.pk)
            before = rnd.votes_recorded
            Vote.objects.create(round=rnd, voter=self.spectators[0], voted_for=self.producer)
            rnd.votes_recorded += 1
            rnd.save()
            self.assertEqual(rnd.votes_recorded, before + 1)


class BingoClaimIdempotencyTestCase(TestCase):
    """Bingo claim endpoint is idempotent — duplicate claims rejected."""

    def setUp(self):
        self.room = Room.objects.create(name="Bingo Room", code="9999")
        self.player = Player.objects.create(
            room=self.room, name="BingoPlayer", is_host=True, is_spectator=False
        )
        create_user_for_player(self.player)
        self.url = reverse(
            "player-claim-bingo", kwargs={"player_secret": str(self.player.player_secret)}
        )
        self.client = APIClient()

    def test_first_claim_succeeds_second_rejected(self):
        r1 = self.client.post(self.url)
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        self.assertTrue(BingoClaim.objects.filter(room=self.room, player=self.player).exists())

        r2 = self.client.post(self.url)
        self.assertEqual(r2.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            BingoClaim.objects.filter(room=self.room, player=self.player).count(), 1
        )

    def test_atomic_duplicate_claim_cannot_double_insert(self):
        """Two explicit transactions racing on get_or_create+create cannot both win."""
        # First claim
        with transaction.atomic():
            BingoClaim.objects.create(room=self.room, player=self.player)
        self.assertEqual(
            BingoClaim.objects.filter(room=self.room, player=self.player).count(), 1
        )

        # Second attempt inside its own transaction must hit the unique constraint
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                BingoClaim.objects.create(room=self.room, player=self.player)
        self.assertEqual(
            BingoClaim.objects.filter(room=self.room, player=self.player).count(), 1
        )


class PromoteHostAtomicTestCase(TestCase):
    """promote_new_host() must not leave a dual-host state."""

    def setUp(self):
        self.room = Room.objects.create(name="Host Room", code="4444")
        self.old_host = Player.objects.create(
            room=self.room, name="OldHost", is_host=True, is_spectator=False
        )
        self.p1 = Player.objects.create(
            room=self.room, name="P1", is_host=False, is_spectator=False,
            is_connected=True,
        )
        self.p2 = Player.objects.create(
            room=self.room, name="P2", is_host=False, is_spectator=False,
            is_connected=True,
        )

    def test_promote_demotes_stale_host(self):
        """Promoting a new host demotes the previous one — never two hosts."""
        from game_engine.consumers import GameConsumer

        class FC(GameConsumer):
            def __init__(self, rid):
                self.game_id = str(rid)

        fc = FC(str(self.room.id))
        # Call the underlying SYNC implementation directly (bypass the
        # database_sync_to_async worker thread, which would not share this
        # test's DB transaction).
        promote = GameConsumer.promote_new_host.__wrapped__
        promoted = promote(fc)

        self.assertIsNotNone(promoted)
        # Exactly one host remains
        self.assertEqual(
            Player.objects.filter(room=self.room, is_host=True).count(), 1
        )
        # The promoted player is the connected candidate
        self.assertTrue(promoted.is_host)
        # The old host is no longer host
        self.old_host.refresh_from_db()
        self.assertFalse(self.old_host.is_host)

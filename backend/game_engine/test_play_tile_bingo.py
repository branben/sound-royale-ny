"""Regression tests for the tile-play -> bingo-resolution path.

These guard against the prod incident where beat uploads silently 500'd
(reserved `LogRecord` attribute collision in the orphan `upload_audio`
endpoint) and where tiles could never reach `Tile.Status.COMPLETE`, so a
bingo line was mathematically impossible and no winner was ever declared.

The path under test is the REAL completion endpoint the frontend uses:
`TileViewSet.play_tile` (POST /api/tiles/<id>/play_tile/). It sets
`tile.status = COMPLETE` and calls `_resolve_bingo_and_winner`, which
declares a winner on the first 3-in-a-row.
"""
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from game_engine.models import Room, Tile
from game_engine.test_auth_helper import make_player

# A tiny valid-ish WAV header so the upload passes MIME + size checks.
_WAV_BYTES = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"


def _wav_file(name="beat.wav"):
    return SimpleUploadedFile(name, _WAV_BYTES, content_type="audio/wav")


def _genres_for_board(room):
    """Return the 9 genres currently on the host's board, in position order."""
    host = room.players.filter(is_spectator=False).first()
    tiles = sorted(host.tiles.all(), key=lambda t: t.position)
    return [t.genre for t in tiles]


class PlayTileBingoTestCase(TestCase):
    """play_tile must complete a tile and resolve a bingo line."""

    def setUp(self):
        self.room = Room.objects.create(
            code="BING1", name="BingoTest", match_type=Room.MatchType.CASUAL
        )
        self.host = make_player(self.room, name="Host", is_host=True)
        self.room.players.add(self.host)
        # Build the host's 3x3 board deterministically (one tile per genre).
        genres = [
            Tile.Genre.PHONK, Tile.Genre.TRAP, Tile.Genre.LOFI,
            Tile.Genre.HOUSE, Tile.Genre.DRILL, Tile.Genre.RNB,
            Tile.Genre.EDM, Tile.Genre.JAZZ, Tile.Genre.AMBIENT,
        ]
        for position, genre in enumerate(genres):
            Tile.objects.create(
                player=self.host, room=self.room, position=position, genre=genre
            )
        # Game must be PLAYING for play_tile to accept the tile.
        self.room.status = Room.Status.PLAYING
        self.room.save()

    def _play(self, tile, player):
        client = APIClient()
        client.credentials(
            HTTP_X_PLAYER_ID=str(player.id),
            HTTP_X_PLAYER_SECRET=player.plain_secret,
        )
        # Resolve the current round genre so the tile genre matches.
        from game_engine.models import Round

        round_obj = Round.objects.filter(room=self.room).first()
        if round_obj is None:
            round_obj = Round.objects.create(
                room=self.room, round_number=self.room.current_round,
                current_tile_genre=tile.genre,
            )
        else:
            round_obj.current_tile_genre = tile.genre
            round_obj.save(update_fields=["current_tile_genre"])

        resp = client.post(
            f"/api/tiles/{tile.id}/play_tile/",
            {"audio_file": _wav_file(), "player_id": str(player.id)},
            format="multipart",
        )
        return resp

    def test_play_tile_marks_tile_complete(self):
        """A successful play_tile must transition the tile to COMPLETE."""
        tile = self.host.tiles.get(position=0)
        resp = self._play(tile, self.host)

        self.assertEqual(resp.status_code, 200, resp.content)
        tile.refresh_from_db()
        self.assertEqual(tile.status, Tile.Status.COMPLETE)

    def test_play_tile_rejects_wrong_owner(self):
        """A player cannot play a tile they do not own."""
        other = make_player(self.room, name="Other")
        self.room.players.add(other)
        tile = self.host.tiles.get(position=0)
        resp = self._play(tile, other)

        self.assertEqual(resp.status_code, 403, resp.content)
        tile.refresh_from_db()
        self.assertEqual(tile.status, Tile.Status.EMPTY)

    def test_five_completed_with_line_declares_winner(self):
        """Bingo resolves only after MIN_TILES_FOR_BINGO_RESOLUTION (5) completed
        tiles that include a 3-in-a-row line (here the top row + 2 more)."""
        # Top row (0,1,2) is the winning line; play 5 total to clear the
        # resolution threshold (Room.MIN_TILES_FOR_BINGO_RESOLUTION == 5).
        for position in (0, 1, 2, 3, 4):
            tile = self.host.tiles.get(position=position)
            resp = self._play(tile, self.host)
            self.assertEqual(resp.status_code, 200, resp.content)

        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.FINISHED)
        self.assertEqual(self.room.winner_id, self.host.id)


class TwoProducerBingoTestCase(TestCase):
    """Two producers: either completing a line must be able to win."""

    def setUp(self):
        self.room = Room.objects.create(
            code="BING2", name="TwoProd", match_type=Room.MatchType.CASUAL
        )
        self.host = make_player(self.room, name="Host", is_host=True)
        self.p2 = make_player(self.room, name="P2")
        self.room.players.add(self.host, self.p2)
        for player in (self.host, self.p2):
            for position, genre in enumerate(
                [
                    Tile.Genre.PHONK, Tile.Genre.TRAP, Tile.Genre.LOFI,
                    Tile.Genre.HOUSE, Tile.Genre.DRILL, Tile.Genre.RNB,
                    Tile.Genre.EDM, Tile.Genre.JAZZ, Tile.Genre.AMBIENT,
                ]
            ):
                Tile.objects.create(
                    player=player, room=self.room, position=position, genre=genre
                )
        self.room.status = Room.Status.PLAYING
        self.room.save()

    def _play(self, tile, player):
        client = APIClient()
        client.credentials(
            HTTP_X_PLAYER_ID=str(player.id),
            HTTP_X_PLAYER_SECRET=player.plain_secret,
        )
        from game_engine.models import Round

        round_obj = Round.objects.filter(room=self.room).first()
        if round_obj is None:
            round_obj = Round.objects.create(
                room=self.room, round_number=self.room.current_round,
                current_tile_genre=tile.genre,
            )
        else:
            round_obj.current_tile_genre = tile.genre
            round_obj.save(update_fields=["current_tile_genre"])
        return client.post(
            f"/api/tiles/{tile.id}/play_tile/",
            {"audio_file": _wav_file(), "player_id": str(player.id)},
            format="multipart",
        )

    def test_second_producer_can_win(self):
        """Player 2 completing 5 tiles with a line (positions 3,4,5,6,7) wins."""
        for position in (3, 4, 5, 6, 7):
            tile = self.p2.tiles.get(position=position)
            resp = self._play(tile, self.p2)
            self.assertEqual(resp.status_code, 200, resp.content)

        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.FINISHED)
        self.assertEqual(self.room.winner_id, self.p2.id)

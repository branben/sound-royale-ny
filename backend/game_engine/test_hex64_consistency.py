"""TDD test for is_hex64 inconsistency between models.py and auth.py.

Bug: models.py:163 uses `len != 64 AND not is_hex64()` to decide whether to
hash a player_secret. auth.py:37 uses just `is_hex64()`. For a 64-char
non-hex string, models.py stores it as plaintext while auth.py hashes it
before lookup, making authentication impossible.
"""
import pytest
from asgiref.sync import async_to_sync

from game_engine.auth import _resolve_player
from game_engine.models import Player, Room
from game_engine.security import hash_secret, is_hex64
from game_engine.test_auth_helper import make_player

pytestmark = [pytest.mark.security, pytest.mark.django_db]


def test_models_hashes_64char_nonhex_secret():
    """A 64-char non-hex secret must be hashed before storage.

    models.py must NOT store a 64-char non-hex string as plaintext.
    is_hex64() already validates length == 64, so the extra `len != 64`
    guard is both redundant and harmful.
    """
    room = Room.objects.create(code="HX01")
    secret = "x" * 64  # 64 chars, contains 'x' which is not hex
    assert not is_hex64(secret), "precondition: test input must be non-hex"
    assert len(secret) == 64, "precondition: test input must be 64 chars"

    player = make_player(room=room, player_secret=secret)
    player.refresh_from_db()

    # BUG: models.py stores this as plaintext because `len == 64` short-circuits.
    assert player.player_secret != secret, (
        "64-char non-hex secret was stored as plaintext — "
        "inconsistent with auth.py which hashes it"
    )
    assert is_hex64(player.player_secret), (
        f"stored secret should be a hex64 digest, got {player.player_secret!r}"
    )
    assert player.player_secret == hash_secret(secret)


def test_auth_resolves_player_with_64char_nonhex_secret():
    """auth.py must authenticate a player whose secret is 64-char non-hex.

    This is the end-to-end round-trip: models.py stores the hash,
    auth.py hashes the presented secret for lookup, and they must match.
    """
    room = Room.objects.create(code="HX02")
    secret = "y" * 64
    assert not is_hex64(secret)

    player = make_player(room=room, player_secret=secret)
    player.refresh_from_db()

    resolved = async_to_sync(_resolve_player)(str(player.id), secret)
    assert resolved == player, (
        "auth.py failed to resolve player with 64-char non-hex secret — "
        "models.py/auth.py hashing mismatch"
    )

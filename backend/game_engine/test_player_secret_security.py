"""Security tests for player_secret hashing + rotation (guardrail #105).

These assert the class-level contract:
- The stored value is NEVER the plaintext (it is a SHA-256 hex digest).
- Issuance (create/join) returns the plaintext exactly once.
- The rotation endpoint issues a new plaintext and invalidates the old.
- Rotation rejects a wrong secret.
"""
import secrets

import pytest
from asgiref.sync import async_to_sync
from django.contrib.auth.models import User
from django.core.exceptions import ObjectDoesNotExist
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .models import Player, Room
from .security import hash_secret, is_hex64
from game_engine.auth import _resolve_player_from_token
from game_engine.test_auth_helper import create_user_for_player, make_player


pytestmark = [pytest.mark.security, pytest.mark.django_db]

_client = APIClient()


def test_jwt_fallback_logs_info_for_invalid_token_and_returns_none(caplog):
    """Guardrail #102: an invalid/expired token must not be silently swallowed.

    Expected client-side failures (TokenError) log at INFO with a safe
    error_type discriminator (no token value) and fall back to None.
    """
    import logging

    with pytest.MonkeyPatch().context() as mp, caplog.at_level(logging.INFO):
        mp.setattr(AccessToken, "__init__", lambda self, token: (_ for _ in ()).throw(TokenError("bad token")))
        result = async_to_sync(_resolve_player_from_token)("not-a-real-jwt")

    assert result is None
    info_records = [r for r in caplog.records if r.levelno == logging.INFO]
    assert info_records, "expected an INFO log for the expected token failure"
    assert "error_type=TokenError" in info_records[0].getMessage()
    assert "JWT player resolution failed" in info_records[0].getMessage()


def test_jwt_fallback_logs_warning_with_traceback_for_unexpected_error(caplog):
    """Guardrail #102: unexpected server errors stay visible (WARNING + traceback).

    An unexpected operational failure during resolution (e.g. a DB/ORM error
    that is NOT an expected token/user-lookup miss) must surface at WARNING
    with exc_info (traceback), not be silently swallowed.
    """
    import logging

    from django.contrib.auth import get_user_model

    # Fake user model whose lookup raises an unexpected (non-token) error.
    class _BrokenUserLookup:
        objects = type(
            "_M",
            (),
            {"get": staticmethod(lambda *a, **k: (_ for _ in ()).throw(ValueError("db down")))},
        )()

    with (
        pytest.MonkeyPatch().context() as mp,
        caplog.at_level(logging.WARNING),
    ):
        # Class/global patches cross the async_to_sync thread boundary
        # (manager-instance patches do not).
        mp.setattr(AccessToken, "__init__", lambda self, token=None: None)
        mp.setattr(AccessToken, "__getitem__", lambda self, key: 123)
        mp.setattr("django.contrib.auth.get_user_model", lambda: _BrokenUserLookup)
        result = async_to_sync(_resolve_player_from_token)("valid-header-bogus-signature")

    assert result is None
    warn_records = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert warn_records, "expected a WARNING log for the unexpected failure"
    assert "error_type=ValueError" in warn_records[0].getMessage()
    assert warn_records[0].exc_info is not None, "unexpected failure must include a traceback"


def test_jwt_resolves_player_on_valid_token():
    """Sanity: a valid token still resolves the player (no behavior change)."""
    room = Room.objects.create(code="GRD3")
    player = make_player(room=room)
    create_user_for_player(player)
    # Build a real access token for the linked user.
    from rest_framework_simplejwt.tokens import RefreshToken

    token = str(RefreshToken.for_user(player.user).access_token)
    assert async_to_sync(_resolve_player_from_token)(token) == player


_client = APIClient()



def test_stored_secret_is_hashed_not_plaintext():
    plain = secrets.token_urlsafe(32)
    player = make_player(room=Room.objects.create(code="SECR"), player_secret=plain)
    player.refresh_from_db()
    # Stored value must be the hash, distinct from the plaintext.
    assert player.player_secret != plain
    assert is_hex64(player.player_secret)
    assert player.player_secret == hash_secret(plain)


def test_create_room_returns_plaintext_secret():
    url = reverse("room-list")  # POST /api/rooms/ creates a room
    response = _client.post(url, {"player_name": "H", "name": "New Room"}, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    secret = response.data["player_secret"]
    assert secret  # plaintext returned to client
    player = Player.objects.get(id=response.data["player_id"])
    assert player.player_secret == hash_secret(secret)  # stored hashed


def test_rotation_invalidates_old_secret():
    room = Room.objects.create(code="ROT0")
    player = make_player(room=room)
    old_plain = player.plain_secret
    url = reverse("player-rotate-secret", kwargs={"player_secret": old_plain})
    response = _client.post(url, {"player_secret": old_plain}, format="json")
    assert response.status_code == status.HTTP_200_OK
    new_plain = response.data["player_secret"]
    assert new_plain != old_plain

    player.refresh_from_db()
    # New secret stored; old secret no longer valid.
    assert player.player_secret == hash_secret(new_plain)
    assert player.player_secret != hash_secret(old_plain)


def test_rotation_rejects_wrong_secret():
    room = Room.objects.create(code="ROT1")
    player = make_player(room=room)
    url = reverse("player-rotate-secret", kwargs={"player_secret": player.plain_secret})
    response = _client.post(url, {"player_secret": "wrong-secret"}, format="json")
    assert response.status_code == status.HTTP_403_FORBIDDEN

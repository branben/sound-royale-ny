"""Security tests for player_secret hashing + rotation (guardrail #105).

These assert the class-level contract:
- The stored value is NEVER the plaintext (it is a SHA-256 hex digest).
- Issuance (create/join) returns the plaintext exactly once.
- The rotation endpoint issues a new plaintext and invalidates the old.
- Rotation rejects a wrong secret.
"""
import secrets

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import Player, Room
from .security import hash_secret, is_hex64
from game_engine.test_auth_helper import make_player


pytestmark = [pytest.mark.security, pytest.mark.django_db]

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

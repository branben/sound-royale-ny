"""Security tests for WebSocket auth resolution (guardrail #105).

The player_secret / JWT transport fix keeps the secret OUT of the URL
(frontend sends it as a post-handshake `auth` message; backend resolves
via game_engine.auth._resolve_player / _resolve_player_from_token).

This repo's pytest config has no async plugin, so we unit-test the
resolution functions directly (sync wrapper) rather than a live socket
handshake. The URL-transport guarantee is enforced by the frontend
(getWsUrl no longer sets `secret`/`token` query params).
"""
from uuid import uuid4

import asyncio

import pytest

from game_engine.auth import _resolve_player
from game_engine.models import Player, Room


@pytest.mark.django_db
def test_resolve_player_valid_secret():
    async def _run():
        room = await Room.objects.acreate(code="Z9Y8X7")
        secret = uuid4()
        p = await Player.objects.acreate(room=room, name="AuthTest", player_secret=secret)
        got = await _resolve_player(str(p.id), str(secret))
        assert got is not None and str(got.id) == str(p.id)
        # wrong (but valid-UUID) secret -> None
        none = await _resolve_player(str(p.id), str(uuid4()))
        assert none is None

    asyncio.run(_run())


@pytest.mark.django_db
def test_resolve_player_nonexistent():
    async def _run():
        # valid UUID format, does not exist -> None
        assert await _resolve_player(str(uuid4()), str(uuid4())) is None

    asyncio.run(_run())

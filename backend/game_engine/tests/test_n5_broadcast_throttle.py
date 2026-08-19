"""Test N5: Broadcast throttle must be Redis-backed (shared across workers)."""
import pytest


def test_n5_broadcast_throttle_uses_redis():
    """RoomBroadcastThrottle must use Redis (shared across workers), not in-process dict."""
    from game_engine.throttling import RoomBroadcastThrottle
    from django.core.cache import caches

    throttle = RoomBroadcastThrottle()
    # Verify it uses the Django cache (Redis) rather than in-process dict
    assert hasattr(throttle, "_cache"), "RoomBroadcastThrottle must have _cache attribute"
    cache = caches["default"]
    assert hasattr(cache, "client") or hasattr(cache, "_redis"), (
        "Throttle cache must be Redis-backed"
    )


def test_n5_broadcast_throttle_allow_returns_bool():
    """allow() must return True on first call, False within MIN_INTERVAL."""
    from game_engine.throttling import RoomBroadcastThrottle

    throttle = RoomBroadcastThrottle()
    room = "test-room-group-n5"

    # First call should allow
    assert throttle.allow(room) is True, "First broadcast should be allowed"

    # Immediate second call should be throttled
    assert throttle.allow(room) is False, "Second broadcast within 2s should be throttled"


def test_n5_broadcast_throttle_reset():
    """reset() must clear the throttle for a room."""
    from game_engine.throttling import RoomBroadcastThrottle

    throttle = RoomBroadcastThrottle()
    room = "test-room-group-n5-reset"

    throttle.allow(room)
    assert throttle.allow(room) is False, "Should be throttled"

    throttle.reset(room)
    assert throttle.allow(room) is True, "After reset, should be allowed"

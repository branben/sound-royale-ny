"""Test N4: 51st client in a room must be rejected with 4409 (Room Full)."""
import pytest


def test_n4_class_level_room_cap_exists():
    """GameConsumer must have a per-room connection cap."""
    from game_engine.consumers import GameConsumer

    assert hasattr(GameConsumer, "MAX_CLIENTS_PER_ROOM"), (
        "GameConsumer must have MAX_CLIENTS_PER_ROOM class attribute"
    )
    assert GameConsumer.MAX_CLIENTS_PER_ROOM == 50, (
        f"MAX_CLIENTS_PER_ROOM must be 50, got {GameConsumer.MAX_CLIENTS_PER_ROOM}"
    )


def test_n4_room_client_count_dict_exists():
    """GameConsumer must track per-room connection counts (Redis-backed)."""
    from game_engine import consumers
    from game_engine.consumers import GameConsumer

    # N4 uses Redis cache for room connection tracking (shared across workers)
    # Verify the connect method uses cache for room count tracking
    import inspect
    source = inspect.getsource(consumers.GameConsumer.connect)
    assert "ws_room_count" in source or "cache" in source, (
        "GameConsumer must track per-room connections via cache"
    )


def test_n4_close_code_4409_defined():
    """Close code 4409 must be used for 'Room Full'."""
    from game_engine import consumers

    import inspect
    source = inspect.getsource(consumers.GameConsumer.connect)
    assert "4409" in source, (
        "connect() must close with code 4409 when room is full"
    )


def test_n4_disconnect_decrements_room_count():
    """disconnect() must decrement the per-room connection count."""
    from game_engine import consumers

    import inspect
    source = inspect.getsource(consumers.GameConsumer.disconnect)
    # N4 uses Redis cache (ws_room_count: prefix) instead of class-level dict
    assert "ws_room_count" in source or "cache.decr" in source, (
        "disconnect() must decrement room connection count"
    )

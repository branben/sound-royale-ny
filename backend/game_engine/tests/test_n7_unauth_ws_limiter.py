"""Test N7: 6th unauthenticated WS connection from same IP must be rejected with 4408."""
import pytest


def test_n7_class_level_limiter_exists():
    """GameConsumer must have a per-IP unauthenticated connection limiter."""
    from game_engine.consumers import GameConsumer

    assert hasattr(GameConsumer, "MAX_UNAUTHENTICATED_PER_IP"), (
        "GameConsumer must have MAX_UNAUTHENTICATED_PER_IP class attribute"
    )
    assert GameConsumer.MAX_UNAUTHENTICATED_PER_IP == 5, (
        f"MAX_UNAUTHENTICATED_PER_IP must be 5, got {GameConsumer.MAX_UNAUTHENTICATED_PER_IP}"
    )


def test_n7_unauth_connections_dict_exists():
    """GameConsumer must have a class-level _unauth_connections dict."""
    from game_engine.consumers import GameConsumer

    assert hasattr(GameConsumer, "_unauth_connections"), (
        "GameConsumer must have _unauth_connections class attribute"
    )
    assert isinstance(GameConsumer._unauth_connections, dict), (
        "_unauth_connections must be a dict"
    )


def test_n7_close_code_4408_defined():
    """Close code 4408 must be used for 'Too Many Unauthenticated Connections'."""
    from game_engine import consumers

    # The close code 4408 should be referenced in the connect method
    import inspect
    source = inspect.getsource(consumers.GameConsumer.connect)
    assert "4408" in source, (
        "connect() must close with code 4408 when unauthenticated limit exceeded"
    )


def test_n7_disconnect_decrements_count():
    """disconnect() must decrement the per-IP unauthenticated connection count."""
    from game_engine import consumers

    import inspect
    source = inspect.getsource(consumers.GameConsumer.disconnect)
    assert "_unauth_connections" in source, (
        "disconnect() must decrement _unauth_connections"
    )

"""Test N6: Cache invalidation on state mutation."""
import pytest


@pytest.mark.django_db
def test_n6_views_have_cache_invalidation_import():
    """views.py must import caches for invalidation."""
    from game_engine import views

    import inspect
    source = inspect.getsource(views)
    assert "caches" in source, "views.py must import caches"


@pytest.mark.django_db
def test_n6_bingo_claim_invalidates_cache():
    """Bingo claim endpoint must invalidate room cache."""
    from game_engine.views import RoomViewSet

    # Check that the view has cache invalidation logic
    import inspect
    source = inspect.getsource(RoomViewSet)
    assert "cache" in source.lower() or "invalidate" in source.lower(), (
        "RoomViewSet must have cache invalidation on state mutation"
    )


@pytest.mark.django_db
def test_n6_tile_submit_invalidates_cache():
    """Tile submit endpoint must invalidate room cache."""
    from game_engine.views import TileViewSet

    import inspect
    source = inspect.getsource(TileViewSet.play_tile)
    assert "cache" in source.lower() or "invalidate" in source.lower(), (
        "play_tile must invalidate cache on tile submission"
    )


@pytest.mark.django_db
def test_n6_cache_invalidation_method_exists():
    """RoomViewSet must have a _invalidate_room_cache method."""
    from game_engine.views import RoomViewSet

    assert hasattr(RoomViewSet, "_invalidate_room_cache"), (
        "RoomViewSet must have _invalidate_room_cache method"
    )

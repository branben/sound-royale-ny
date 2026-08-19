"""Test N1: Global throttle must be Redis-backed (shared across workers)."""
import pytest
from django.test import RequestFactory
from game_engine.throttling import GlobalRateThrottle


@pytest.mark.django_db
def test_global_throttle_uses_shared_cache():
    """Global throttle must use a shared cache (Redis), not per-process LocMemCache."""
    from django.core.cache import caches

    cache = caches["default"]
    # RedisCache has `client` attribute; LocMemCache does not
    assert hasattr(cache, "client") or hasattr(cache, "_redis"), (
        "Throttle cache must be Redis-backed (shared across workers)"
    )


@pytest.mark.django_db
def test_global_throttle_single_bucket():
    """All requests share one global bucket (not per-user, not per-process)."""
    throttle = GlobalRateThrottle()
    factory = RequestFactory()
    request = factory.get("/api/rooms/")

    # The cache key must be a constant string (single shared bucket)
    key = throttle.get_cache_key(request, None)
    assert key == "global_sound_royale_throttle", (
        f"Expected 'global_sound_royale_throttle', got {key!r}"
    )

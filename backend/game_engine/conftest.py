"""conftest.py — override CACHES so tests run without django_redis.

The repo's settings.py uses django_redis.cache.RedisCache, but django_redis
is not installed in .venv (Tirith threat-intelligence scan blocks installs).
Override to LocMemCache before any DB/cache fixtures fire.
"""
def pytest_configure(config):
    from django.conf import settings
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }

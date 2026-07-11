#!/usr/bin/env python3
"""Self-contained Django harness to reproduce BUG-2 (health check w/ Redis down).

This wraps the REAL ``HealthCheckView`` from ``backend/game_engine/health.py``
in a minimal Django project so the endpoint can be exercised end-to-end inside
the TestDriver sandbox with Redis unavailable.

TST-1 resilience: the test never hardcodes ``/api/health/``. The URL is
registered under the same route name used in the repo (``health-check``) and is
resolved with :func:`django.urls.reverse`. The resolved path is written to
``HEALTH_URL_FILE`` (and echoed to stdout as ``HEALTH_URL=<path>``) at boot so
the browser/HTTP client can discover it dynamically.

Usage::

    HEALTH_HEALTH_PY=/path/to/real/health.py \
    HEALTH_URL_FILE=/tmp/health_url.txt \
    python3 health_harness.py runserver 127.0.0.1:8111 --noreload

If ``HEALTH_HEALTH_PY`` points at the repo's real ``health.py`` it is imported
directly; otherwise the copy vendored next to this harness is used.
"""

import os
import sys
import importlib.util

import django
from django.conf import settings
from django.urls import path, reverse


def _load_health_view():
    """Import HealthCheckView from the real repo file when provided."""
    real = os.environ.get("HEALTH_HEALTH_PY")
    candidates = [real] if real else []
    candidates.append(os.path.join(os.path.dirname(__file__), "health.py"))
    for src in candidates:
        if src and os.path.isfile(src):
            spec = importlib.util.spec_from_file_location("real_health", src)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod.HealthCheckView, src
    raise SystemExit("Could not locate a health.py with HealthCheckView")


settings.configure(
    DEBUG=True,
    SECRET_KEY="harness-only-not-secret",
    ALLOWED_HOSTS=["*"],
    ROOT_URLCONF=__name__,
    DATABASES={
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    },
    # Redis intentionally pointed at a dead port so the Redis probe fails,
    # reproducing the "Redis down" production scenario for BUG-2.
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [os.environ.get("HEALTH_REDIS_URL", "redis://127.0.0.1:6390/0")]
            },
        }
    },
    INSTALLED_APPS=[
        "django.contrib.contenttypes",
        "django.contrib.auth",
    ],
    LOGGING_CONFIG=None,
)

django.setup()

HealthCheckView, _src = _load_health_view()

# Same route NAME as the real repo (backend/game_engine/urls.py -> "health-check").
urlpatterns = [
    path("api/health/", HealthCheckView.as_view(), name="health-check"),
]

# TST-1: resolve the URL via reverse() rather than hardcoding it, then publish it.
_resolved = reverse("health-check")
_url_file = os.environ.get("HEALTH_URL_FILE")
if _url_file:
    with open(_url_file, "w") as fh:
        fh.write(_resolved)
print(f"HEALTH_URL={_resolved}", flush=True)
print(f"HEALTH_SOURCE={_src}", flush=True)


if __name__ == "__main__":
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)

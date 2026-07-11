"""Minimal Django harness running the REAL health-check logic from
sound-royale-ny backend/game_engine/health.py, with Redis pointed at a dead
port to simulate Redis being DOWN.

BUG-2: the endpoint reports overall "ok" / HTTP 200 even when Redis is
unreachable. Correct behavior: overall "error" / HTTP 503.
"""
import django
from django.conf import settings

settings.configure(
    DEBUG=True,
    SECRET_KEY="test-only-key",
    ALLOWED_HOSTS=["*"],
    ROOT_URLCONF=__name__,
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": ["redis://127.0.0.1:6390/0"]},  # dead port -> Redis down
        }
    },
    INSTALLED_APPS=["django.contrib.contenttypes", "django.contrib.auth"],
)
django.setup()

import logging
from django.http import JsonResponse
from django.views import View
from django.db import connections, DEFAULT_DB_ALIAS
from django.urls import path

logger = logging.getLogger(__name__)


# --- BEGIN logic mirrored verbatim from backend/game_engine/health.py ---
class HealthCheckView(View):
    def get(self, request):
        checks = {}
        overall_status = "ok"

        db_status = "ok"
        try:
            conn = connections[DEFAULT_DB_ALIAS]
            conn.ensure_connection()
            conn.close()
        except Exception as exc:
            db_status = "error"
            overall_status = "error"
            logger.warning("Health check: Database unreachable - %s", exc)

        checks["database"] = db_status

        redis_status = "ok"
        try:
            import redis as redis_lib

            channel_config = getattr(settings, 'CHANNEL_LAYERS', {}).get(
                'default', {}
            ).get('CONFIG', {}).get('hosts', [('127.0.0.1', 6379)])

            if channel_config:
                first_host = channel_config[0]
                if isinstance(first_host, str) and first_host.startswith('redis://'):
                    r = redis_lib.from_url(first_host, socket_timeout=3)
                elif isinstance(first_host, (list, tuple)) and len(first_host) == 2:
                    host, port = first_host
                    r = redis_lib.Redis(host=host, port=port, socket_timeout=3)
                else:
                    r = redis_lib.Redis(host=first_host, socket_timeout=3)
                r.ping()
                r.close()
            else:
                redis_status = "error"
                overall_status = "error"
        except Exception as exc:
            redis_status = "degraded"
            logger.warning("Health check: Redis unreachable - %s", exc)

        checks["redis"] = redis_status

        status_code = 200 if overall_status == "ok" else 503
        return JsonResponse(
            status=status_code,
            data={"status": overall_status, "checks": checks},
        )
# --- END logic ---

urlpatterns = [path("api/health/", HealthCheckView.as_view(), name="health-check")]

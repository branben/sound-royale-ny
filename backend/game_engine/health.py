"""Health check endpoint with Redis and database connectivity probes."""

import logging
from django.http import JsonResponse
from django.views import View
from django.conf import settings
from django.core.cache import cache
from django.db import connections, DEFAULT_DB_ALIAS

logger = logging.getLogger(__name__)


class HealthCheckView(View):
    """Return 200 if the service and its dependencies are healthy.

    Checks:
      - Database connectivity
      - Redis connectivity (via CHANNEL_LAYERS config)
    Returns JSON: {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}
    On failure: {"status": "error", "checks": {"database": "error", "redis": "error"}}
    """

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
            logger.warning("Health check: Database unreachable — %s", exc)

        checks["database"] = db_status

        redis_status = "ok"
        try:
            import redis as redis_lib

            channel_config = getattr(settings, 'CHANNEL_LAYERS', {}).get(
                'default', {}
            ).get('CONFIG', {}).get('hosts', [('127.0.0.1', 6379)])

            host, port = channel_config[0]
            if isinstance(host, str) and host.startswith('redis://'):
                r = redis_lib.from_url(host, socket_timeout=3)
            else:
                r = redis_lib.Redis(host=host, port=port, socket_timeout=3)
            r.ping()
            r.close()
        except Exception as exc:
            redis_status = "error"
            overall_status = "error"
            logger.warning("Health check: Redis unreachable — %s", exc)

        checks["redis"] = redis_status

        status_code = 200 if overall_status == "ok" else 503
        return JsonResponse(
            status=status_code,
            data={"status": overall_status, "checks": checks},
        )

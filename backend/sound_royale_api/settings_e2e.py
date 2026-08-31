"""
Django settings for the live E2E backend in CI.

Reuses the test settings (InMemoryChannelLayer, relaxed security) but points at
a persistent Postgres database so a long-running ASGI server (daphne) shares
state across the many HTTP/WS connections the Playwright suite opens. sqlite
:in-memory: is NOT suitable here -- each connection would get its own empty DB.

Usage in CI:
    DJANGO_SETTINGS_MODULE=sound_royale_api.settings_e2e python manage.py migrate
    DJANGO_SETTINGS_MODULE=sound_royale_api.settings_e2e daphne -p 8000 ...

Scope note: LOGGING + MIDDLEWARE additions here are E2E-only. Do NOT touch
settings.py or settings_test.py -- unit-test logging stays quiet.
"""

import os

from sound_royale_api.settings_test import *  # noqa: F401,F403

# Persistent Postgres database from CI service env (default to localhost:5432).
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "sound_royale_test"),
        "USER": os.environ.get("POSTGRES_USER", "postgres"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "postgres"),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

# Allow the Vite dev server (port 8081 in CI) to call the API on :8000.
CORS_ALLOWED_ORIGINS = [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:8080",
    "http://localhost:5173",
]

# Use a REAL (Redis) channel layer, not the in-memory one inherited from
# settings_test. InMemoryChannelLayer isolates each ASGI connection, so
# WebSocket game-state broadcasts never reach other players -- every
# real-time E2E spec fails. CI provisions a redis:7-alpine service.
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [os.environ.get("REDIS_URL", "redis://localhost:6379/0")],
        },
    },
}

# E2E-only: verbose backend logging + 500 response-body capture.
# Inherits settings_test LOGGING (console-only, root INFO, django+game_audit only).
# We OVERWRITE LOGGING here (settings_e2e takes precedence) to add the loggers
# and file handler without touching settings_test.
#
# Tunable via E2E_LOG_LEVEL env (default ERROR) applied to django.request,
# daphne, and channels so a flaky run can be re-run with DEBUG for visibility.
E2E_LOG_LEVEL = os.environ.get("E2E_LOG_LEVEL", "ERROR")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
        "e2e_verbose": {
            "format": "{levelname} {asctime} {name} {module}:{lineno} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "e2e_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": os.path.join(BASE_DIR, "logs", "e2e-django.log"),
            "maxBytes": 20 * 1024 * 1024,
            "backupCount": 3,
            "formatter": "e2e_verbose",
            "encoding": "utf-8",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "game_audit": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        # THE critical one: uncaught-exception stack trace + request line for
        # every HTTP 500. Django logs the traceback here but NOT the body.
        "django.request": {
            "handlers": ["console", "e2e_file"],
            "level": E2E_LOG_LEVEL,
            "propagate": False,
        },
        # ASGI/Twisted-level errors + tracebacks outside Django's handler
        # (Path B: daphne application_checker -> basic_error).
        "daphne": {
            "handlers": ["console", "e2e_file"],
            "level": E2E_LOG_LEVEL,
            "propagate": False,
        },
        # WebSocket consumer/routing errors (covers WS-side 500s).
        "channels": {
            "handlers": ["console", "e2e_file"],
            "level": E2E_LOG_LEVEL,
            "propagate": False,
        },
        # Surfaces explicit logger.exception(...) calls in consumers.py / views.py.
        "game_engine": {
            "handlers": ["console", "e2e_file"],
            "level": "DEBUG",
            "propagate": False,
        },
        # DB-level failures (IntegrityError, lock errors) without full SQL dump.
        "django.db.backends": {
            "handlers": ["console", "e2e_file"],
            "level": "WARNING",
            "propagate": False,
        },
        # NEW: raw 500 response body from ResponseBodyLoggerMiddleware (below).
        # Django's loggers never record response.content -- this middleware is the
        # only reliable way to capture the actual HTTP 500 body.
        "http_500": {
            "handlers": ["console", "e2e_file"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}

# E2E-only: append the 500 body logger at the END so it sees the final response.
# game_engine.middleware.ResponseBodyLoggerMiddleware logs response.content for
# every status_code >= 500 on the http_500 logger. Not installed in prod/test.
MIDDLEWARE = list(MIDDLEWARE) + [
    "game_engine.middleware.ResponseBodyLoggerMiddleware",
]

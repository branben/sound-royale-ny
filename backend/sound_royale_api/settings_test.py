"""
Django test settings for CI — overrides production settings to avoid external services.

Usage in CI:
    DJANGO_SETTINGS_MODULE=sound_royale_api.settings_test pytest ...
"""

import os

# Provide defaults for required env vars so CI doesn't need a .env file
os.environ.setdefault("SECRET_KEY", "ci-test-secret-key-not-for-production")
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver")

from sound_royale_api.settings import *  # noqa: F401,F403

# Use in-memory channel layer for tests — no Redis required
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}

# Disable security settings that interfere with tests
SECURE_SSL_REDIRECT = False
SECURE_HSTS_SECONDS = 0

# Use SQLite for CI tests
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
        # busy_timeout lets concurrent writers (and select_for_update-serialized
        # transactions in our concurrency tests) wait for the lock instead of
        # raising "database table is locked" immediately.
        "OPTIONS": {"timeout": 30},
    }
}

# Disable throttling for tests — tests send rapid sequential requests
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "game_engine.auth.PlayerSecretAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "10000/minute",
        "user": "100000/minute",
        "audio_upload": "10000/minute",
        "room_creation": "10000/minute",
    },
}

# Override LOGGING to remove file handler — CI has no logs/ directory
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
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
    },
}

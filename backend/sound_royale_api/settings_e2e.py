"""
Django settings for the live E2E backend in CI.

Reuses the test settings (InMemoryChannelLayer, relaxed security) but points at
a persistent Postgres database so a long-running ASGI server (daphne) shares
state across the many HTTP/WS connections the Playwright suite opens. sqlite
:memory: is NOT suitable here — each connection would get its own empty DB.

Usage in CI:
    DJANGO_SETTINGS_MODULE=sound_royale_api.settings_e2e python manage.py migrate
    DJANGO_SETTINGS_MODULE=sound_royale_api.settings_e2e daphne -p 8000 ...
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

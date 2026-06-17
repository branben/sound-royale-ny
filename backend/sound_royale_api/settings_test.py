"""
Django test settings for CI — overrides production settings to avoid external services.

Usage in CI:
    DJANGO_SETTINGS_MODULE=sound_royale_api.settings_test pytest ...
"""

import os

# Provide defaults for required env vars so CI doesn't need a .env file
os.environ.setdefault("SECRET_KEY", "ci-test-secret-key-not-for-production")
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("ALLOWED_HOSTS", "localhost,127.0.0.1")

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
    }
}

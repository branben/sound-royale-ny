"""
Django test settings for CI — overrides production settings to avoid external services.

Usage in CI:
    DJANGO_SETTINGS_MODULE=sound_royale_api.settings_test pytest ...
"""

from sound_royale_api.settings import *  # noqa: F401,F403

# Use in-memory channel layer for tests — no Redis required
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}

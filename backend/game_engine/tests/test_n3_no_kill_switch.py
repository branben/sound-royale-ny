"""Test N3: Production must not allow a single env var to disable all throttling."""
import pytest
from django.conf import settings


def test_no_disable_throttles_kill_switch():
    """Production must not allow DISABLE_THROTTLES to disable all protection."""
    throttle_classes = settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_CLASSES", [])
    assert "game_engine.throttling.GlobalRateThrottle" in str(throttle_classes), (
        "GlobalRateThrottle must always be enabled (no DISABLE_THROTTLES kill switch)"
    )


def test_throttle_rates_have_global():
    """Global throttle rate must be configured."""
    rates = settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {})
    assert "global" in rates, "Global throttle rate must be configured"

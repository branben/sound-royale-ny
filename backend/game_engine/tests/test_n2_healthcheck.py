"""Test N2: Healthcheck interval must be 5m (not 30s) to avoid burning 28% of daily budget."""
import pytest


def test_healthcheck_interval_is_5m():
    """Healthcheck must run at 5m intervals, not 30s (budget defense)."""
    with open("../Dockerfile.backend") as f:
        content = f.read()
    assert "--interval=5m" in content, (
        "Healthcheck interval must be 5m (was 30s = 28% of daily budget)"
    )
    assert "--interval=30s" not in content, (
        "30s interval burns 2,880 req/day (28% of 16K budget)"
    )


def test_healthcheck_start_period():
    """Healthcheck must have a start-period to avoid false-healthy on boot."""
    with open("../Dockerfile.backend") as f:
        content = f.read()
    assert "--start-period=" in content, (
        "Healthcheck must have --start-period to avoid false-healthy on boot"
    )

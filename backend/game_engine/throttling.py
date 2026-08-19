"""Custom throttles for Sound Royale.

These caps exist to keep us inside Supabase's free-tier budget
(~500K API requests/month ≈ ~16K/day). Without a global cap,
a single reconnect storm or healthcheck loop can blow the monthly
budget in hours.
"""
from rest_framework.throttling import SimpleRateThrottle


class GlobalRateThrottle(SimpleRateThrottle):
    """Single shared bucket across ALL users — the last line of defense
    against a request storm (e.g. WebSocket reconnect cascades, or a
    single IP hammering the API).

    scope name maps to the 'global' key in DEFAULT_THROTTLE_RATES.
    """

    scope = "global"

    def get_cache_key(self, request, view):
        return "global_sound_royale_throttle"


class RoomBroadcastThrottle:
    """Redis-backed token bucket that rate-limits how often we broadcast
    game_state to a room group. Prevents N×N storms when multiple
    clients connect/disconnect around the same time.

    Uses Redis SETNX with TTL so the throttle is shared across ALL
    Daphne workers (not per-process).
    """

    # Max one broadcast per room per this many seconds
    MIN_INTERVAL = 2.0

    def __init__(self):
        from django.core.cache import caches
        self._cache = caches["default"]

    def allow(self, room_group_name: str) -> bool:
        key = f"broadcast_throttle:{room_group_name}"
        # SETNX with TTL — atomic, shared across workers
        added = self._cache.add(key, "1", timeout=int(self.MIN_INTERVAL))
        return added

    def reset(self, room_group_name: str):
        key = f"broadcast_throttle:{room_group_name}"
        self._cache.delete(key)

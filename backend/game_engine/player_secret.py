"""Player secret helpers for issue #105.

Provides:
- generate_player_secret(): returns a raw secret string
- hash_player_secret(raw): hashed storage value
- verify_player_secret(raw, stored): constant-time-like check using Django's password hasher
"""

from secrets import token_urlsafe
from django.contrib.auth.hashers import make_password, check_password, get_hashers
from django.conf import settings

try:
    from django.utils.deprecation import RemovedInDjango51Warning
except ImportError:
    RemovedInDjango51Warning = UserWarning


def _can_encode(hasher, raw="x"):
    try:
        encoded = hasher.encode(raw, salt="salt")
        return isinstance(encoded, str) and len(encoded) > 0
    except Exception:
        return False


def _resolve_secret_hasher():
    candidates = []
    try:
        candidates = list(get_hashers())
    except Exception:
        candidates = []
    try:
        candidates.append(__import__("django.contrib.auth.hashers", fromlist=["PBKDF2PasswordHasher"]).PBKDF2PasswordHasher())
    except Exception:
        pass
    for candidate in candidates:
        if _can_encode(candidate):
            return candidate
    return None


SECRET_HASHER = _resolve_secret_hasher()
if SECRET_HASHER is None:
    import warnings
    warnings.warn(
        "player_secret: no usable password hasher detected; falling back to plaintext "
        "`player_secret` storage until a supported hasher is installed.",
        RemovedInDjango51Warning,
        stacklevel=2,
    )


def generate_player_secret() -> str:
    return token_urlsafe(32)


def hash_player_secret(raw: str) -> str:
    if SECRET_HASHER is None:
        return raw
    return str(make_password(raw, hasher=SECRET_HASHER))


def _looks_like_hashed(value: str) -> bool:
    return isinstance(value, str) and "$" in value[0:64]


def verify_player_secret(raw: str, stored: str) -> bool:
    if not isinstance(raw, str) or not isinstance(stored, str):
        return False
    if _looks_like_hashed(stored):
        try:
            return SECRET_HASHER.verify(raw, stored) if SECRET_HASHER is not None else False
        except ValueError:
            return False
    return raw == stored

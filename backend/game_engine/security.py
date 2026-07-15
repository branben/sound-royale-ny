"""Secret-hashing helpers for player authentication (guardrail #105).

player_secret is stored ONLY as a SHA-256 hex digest. The plaintext secret
is issued to the client exactly once (on room create / join / rotate) and is
never persisted. All comparisons hash the presented value before lookup.
"""
import hashlib
import secrets


def hash_secret(secret: str) -> str:
    """Return the SHA-256 hex digest of a plaintext secret."""
    if not isinstance(secret, str):
        secret = str(secret)
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def new_player_secret() -> str:
    """Generate a fresh plaintext secret (returned to the client once)."""
    return secrets.token_urlsafe(32)


def is_hex64(value: str) -> bool:
    """True if value is already a 64-char lowercase hex SHA-256 digest."""
    return isinstance(value, str) and len(value) == 64 and all(
        c in "0123456789abcdef" for c in value
    )

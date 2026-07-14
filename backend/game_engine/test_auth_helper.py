"""Shared JWT authentication helpers for backend tests."""

from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
from game_engine.models import Player
from game_engine.security import new_player_secret


def make_player(room, **kwargs) -> Player:
    """Create a Player, capturing the issued plaintext secret on the instance.

    The model stores the secret hashed; tests need the plaintext to act as a
    client. We generate it here and stash it as `player.plain_secret` so
    get_player_secret_header() can return the correct value. An explicit
    `player_secret` kwarg is treated as the plaintext (for callers that reuse
    a known value).
    """
    plain_secret = kwargs.pop("player_secret", None)
    if plain_secret is None:
        plain_secret = new_player_secret()
    else:
        # Coerce UUID/non-str secrets to str so the plaintext is a string
        # (used in URLs and as the client credential).
        plain_secret = str(plain_secret)
    player = Player.objects.create(room=room, player_secret=plain_secret, **kwargs)
    player.plain_secret = plain_secret
    return player


def create_user_for_player(player: Player) -> User:
    """Create a Django User for a Player and link them.

    If a User already exists for the player, it is returned.
    """
    username = f"player_{player.id.hex[:12]}"
    # Use get_or_create in case the user already exists
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={"password": User.objects.make_random_password()},
    )
    # Link the user to the player if not already linked
    if not player.user_id:
        player.user = user
        player.save(update_fields=["user"])
    return user


def get_jwt_header(player: Player) -> dict:
    """Get JWT Authorization header dict for a player."""
    if not player.user_id:
        user = create_user_for_player(player)
    else:
        user = player.user
    refresh = RefreshToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {str(refresh.access_token)}"}


def get_player_secret_header(player: Player) -> dict:
    """Get player_secret fallback header dict for backward-compat tests.

    Uses the captured plaintext (`player.plain_secret`) when available;
    otherwise falls back to the stored (hashed) value for legacy callers.
    """
    secret = getattr(player, "plain_secret", None) or str(player.player_secret)
    return {
        "HTTP_X_PLAYER_ID": str(player.id),
        "HTTP_X_PLAYER_SECRET": secret,
    }

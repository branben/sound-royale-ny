"""Shared JWT authentication helpers for backend tests."""

from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
from game_engine.models import Player


def create_user_for_player(player: Player) -> User:
    """Create a Django User for a Player and link them.

    If a User already exists for the player, it is returned.
    """
    username = f"player_{player.id.hex[:12]}"
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
    """Get player_secret fallback header dict for backward-compat tests."""
    return {
        "HTTP_X_PLAYER_ID": str(player.id),
        "HTTP_X_PLAYER_SECRET": str(player.player_secret),
    }

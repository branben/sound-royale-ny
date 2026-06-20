from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from game_engine.models import Player


class PlayerSecretAuthentication(BaseAuthentication):
    """Authenticate HTTP requests using X-Player-Id and X-Player-Secret headers.

    Clients receive player_id and player_secret on room creation/join.
    They must include both in subsequent requests as header values.
    """

    keyword = "PlayerSecret"

    def authenticate(self, request):
        player_id = request.META.get("HTTP_X_PLAYER_ID")
        player_secret = request.META.get("HTTP_X_PLAYER_SECRET")

        if not player_id or not player_secret:
            return None

        try:
            player = Player.objects.get(id=player_id, player_secret=player_secret)
        except Player.DoesNotExist:
            raise AuthenticationFailed("Invalid player credentials")

        return (player, None)


@database_sync_to_async
def _resolve_player(player_id, player_secret):
    """Resolve a player by id + secret, or return None."""
    try:
        return Player.objects.get(id=player_id, player_secret=player_secret)
    except Player.DoesNotExist:
        return None


@database_sync_to_async
def _resolve_player_from_token(token):
    """Resolve a player from a JWT token, or return None."""
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        from django.contrib.auth import get_user_model

        access_token = AccessToken(token)
        user_id = access_token["user_id"]
        User = get_user_model()
        user = User.objects.get(id=user_id)
        return getattr(user, "player", None)
    except Exception:
        return None


class WebSocketPlayerAuthMiddleware:
    """Authenticate WebSocket connections using JWT token or player_secret fallback.

    Priority:
    1. JWT: ?token=<jwt> query param → resolve via User.player
    2. Fallback: ?player_id=...&secret=... → resolve via Player model

    If valid, sets scope["player"] on the connection scope for consumers
    to use without re-querying.
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        query_params = parse_qs(query_string)

        player = None

        # Try JWT first
        token = query_params.get("token", [None])[0]
        if token:
            player = await _resolve_player_from_token(token)

        # Fallback to player_secret
        if not player:
            player_id = query_params.get("player_id", [None])[0]
            player_secret = query_params.get("secret", [None])[0]
            if player_id and player_secret:
                player = await _resolve_player(player_id, player_secret)

        scope["player"] = player

        return await self.inner(scope, receive, send)


def WebSocketPlayerAuthMiddlewareStack(inner):
    """Construct a middleware stack with WebSocketPlayerAuthMiddleware."""
    from channels.auth import AuthMiddlewareStack
    return AuthMiddlewareStack(WebSocketPlayerAuthMiddleware(inner))

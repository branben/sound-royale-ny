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


class WebSocketPlayerAuthMiddleware:
    """Authenticate WebSocket connections using player_id and secret query params.

    Reads ?player_id=...&secret=... from the WebSocket query string and,
    if valid, sets scope["player"] on the connection scope for consumers
    to use without re-querying.
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        query_params = parse_qs(query_string)

        player_id = query_params.get("player_id", [None])[0]
        player_secret = query_params.get("secret", [None])[0]

        if player_id and player_secret:
            scope["player"] = await _resolve_player(player_id, player_secret)
        else:
            scope["player"] = None

        return await self.inner(scope, receive, send)


def WebSocketPlayerAuthMiddlewareStack(inner):
    """Construct a middleware stack with WebSocketPlayerAuthMiddleware."""
    from channels.auth import AuthMiddlewareStack
    return AuthMiddlewareStack(WebSocketPlayerAuthMiddleware(inner))

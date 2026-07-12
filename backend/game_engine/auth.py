from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from game_engine.models import Player
from .player_secret import generate_player_secret, hash_player_secret, verify_player_secret


class PlayerSecretAuthentication(BaseAuthentication):
    """Authenticate HTTP requests using optional X-Player-Id + X-Player-Secret headers.

    NOTE: Keeping plaintext fallback compatible until issue #105 completes the
    `Player.player_secret` migration to a hashed storage column.
    """

    keyword = "PlayerSecret"

    def authenticate(self, request):
        player_id = request.META.get("HTTP_X_PLAYER_ID")
        player_secret = request.META.get("HTTP_X_PLAYER_SECRET")

        if not player_id or not player_secret:
            return None

        try:
            player = Player.objects.get(id=player_id)
        except Player.DoesNotExist:
            raise AuthenticationFailed("Invalid player credentials")

        if not verify_player_secret(str(player_secret), player.player_secret_hash):
            raise AuthenticationFailed("Invalid player credentials")

        return (player, None)


@database_sync_to_async
def _resolve_player(player_id, player_secret):
    """Resolve a player by id + secret, or return None."""
    try:
        player = Player.objects.get(id=player_id)
    except Player.DoesNotExist:
        return None

    if verify_player_secret(str(player_secret), player.player_secret_hash):
        return player
    return None


def _load_token_player(token):
    import rest_framework_simplejwt.exceptions as jwt_exceptions
    from rest_framework_simplejwt.tokens import AccessToken
    from django.contrib.auth import get_user_model

    try:
        access_token = AccessToken(token)
    except jwt_exceptions.TokenError:
        return None

    user_id = access_token.get("user_id")
    if not user_id:
        return None

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None

    return getattr(user, "player", None)


@database_sync_to_async
def _resolve_player_from_token(token):
    """Resolve a player from a JWT token, or return None."""
    if not token:
        return None
    return _load_token_player(token)


class WebSocketPlayerAuthMiddleware:
    """Authenticate WebSocket connections using JWT token or player_id/secret.

    Priority:
    1. JWT: ?token=<jwt> query param → resolve via User.player
    2. Headers: x-player-id + x-player-secret → resolve via Player model
    3. Fallback: ?player_id=...&secret=... → resolve via Player model
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        query_params = parse_qs(query_string)
        headers = {
            name.decode().lower(): value.decode()
            for name, value in scope.get("headers", [])
        }

        player = None

        token = query_params.get("token", [None])[0]
        if token:
            player = await _resolve_player_from_token(token)

        ws_subprotocol = None
        if not player:
            player_id = (
                headers.get("x-player-id")
                or query_params.get("player_id", [None])[0]
            )
            # player_secret is NEVER read from the URL query string (guardrail #105:
            # secrets must not travel in URLs). It comes from the X-Player-Secret
            # header, or for browser WebSocket clients, from the Sec-WebSocket-Protocol
            # subprotocol negotiated at connect time.
            player_secret = headers.get("x-player-secret")
            if player_secret is None:
                subprotocols = scope.get("subprotocols") or []
                if subprotocols:
                    player_secret = subprotocols[0]
                    ws_subprotocol = player_secret
            if player_id and player_secret:
                player = await _resolve_player(player_id, player_secret)

        # Stash the negotiated subprotocol so the consumer can echo it back on
        # accept() — browsers require an exact subprotocol match or they close.
        scope["_ws_auth_subprotocol"] = ws_subprotocol

        scope["player"] = player

        return await self.inner(scope, receive, send)


def WebSocketPlayerAuthMiddlewareStack(inner):
    """Construct a middleware stack with WebSocketPlayerAuthMiddleware."""
    from channels.auth import AuthMiddlewareStack

    return AuthMiddlewareStack(WebSocketPlayerAuthMiddleware(inner))

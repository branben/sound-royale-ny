import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.core.exceptions import ObjectDoesNotExist
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.exceptions import TokenBackendError, TokenError

from game_engine.models import Player
from game_engine.security import hash_secret, is_hex64

logger = logging.getLogger(__name__)


class PlayerSecretAuthentication(BaseAuthentication):
    """Authenticate HTTP requests using X-Player-Id and X-Player-Secret headers.

    Clients receive player_id and player_secret on room creation/join.
    They must include both in subsequent requests as header values. The
    secret is stored hashed; the presented value is hashed before lookup.
    """

    keyword = "PlayerSecret"

    def authenticate(self, request):
        player_id = request.META.get("HTTP_X_PLAYER_ID")
        player_secret = request.META.get("HTTP_X_PLAYER_SECRET")

        if not player_id or not player_secret:
            return None

        # Symmetric with Player.save(): the stored secret is a 64-char hex
        # digest. Clients send the stored (hashed) value, so only hash
        # when the incoming secret is NOT already a hex digest (avoids
        # double-hashing a value that was persisted hashed).
        secret_lookup = player_secret if is_hex64(player_secret) else hash_secret(player_secret)
        try:
            player = Player.objects.get(
                id=player_id, player_secret=secret_lookup
            )
        except Player.DoesNotExist:
            raise AuthenticationFailed("Invalid player credentials")

        return (player, None)


@database_sync_to_async
def _resolve_player(player_id, player_secret):
    """Resolve a player by id + secret, or return None."""
    secret_lookup = player_secret if is_hex64(player_secret) else hash_secret(player_secret)
    try:
        return Player.objects.get(
            id=player_id, player_secret=secret_lookup
        )
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
    except Exception as e:
        # JWT resolution is a fallback auth path. Expected failures are client-side:
        # an invalid/expired/malformed token (TokenError/TokenBackendError) or a
        # token whose subject no longer exists (ObjectDoesNotExist). These are
        # routine and not a server fault, so log them at INFO with a safe
        # 'error_type' discriminator (no token value) and fall through to
        # player_secret auth. Guardrail #102 requires we NOT silently swallow.
        # Unexpected errors (e.g. DB outage) are surfaced at WARNING with a
        # traceback so genuine operational failures stay visible.
        if isinstance(e, (TokenError, TokenBackendError, ObjectDoesNotExist)):
            logger.info(
                "JWT player resolution failed; falling back to header-based auth (error_type=%s)",
                type(e).__name__,
            )
        else:
            logger.warning(
                "JWT player resolution failed unexpectedly; falling back to header-based auth (error_type=%s)",
                type(e).__name__,
                exc_info=True,
            )
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

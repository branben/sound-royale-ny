from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RoomViewSet,
    PlayerViewSet,
    TileViewSet,
    RequestLoginCodeView,
    VerifyLoginCodeView,
    MeView,
    LogoutView,
    GlobalLeaderboardView,
    EloLedgerMeView,
    EloSummaryMeView,
    EloUserSummaryView,
    DiscordOAuthStartView,
    DiscordOAuthCallbackView,
)
from .webhooks import LinearWebhookView

router = DefaultRouter()
router.register(r'rooms', RoomViewSet)
router.register(r'players', PlayerViewSet)
router.register(r'tiles', TileViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
    path('api/auth/request-code/', RequestLoginCodeView.as_view(), name='auth-request-code'),
    path('api/auth/verify-code/', VerifyLoginCodeView.as_view(), name='auth-verify-code'),
    path('api/auth/me/', MeView.as_view(), name='auth-me'),
    path('api/auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('api/leaderboard/', GlobalLeaderboardView.as_view(), name='global-leaderboard'),
    path('api/elo/me/ledger/', EloLedgerMeView.as_view(), name='elo-ledger-me'),
    path('api/elo/me/summary/', EloSummaryMeView.as_view(), name='elo-summary-me'),
    path('api/elo/users/<uuid:user_id>/summary/', EloUserSummaryView.as_view(), name='elo-user-summary'),
    path('api/discord/oauth/start/', DiscordOAuthStartView.as_view(), name='discord-oauth-start'),
    path('api/discord/oauth/callback/', DiscordOAuthCallbackView.as_view(), name='discord-oauth-callback'),
    path('webhooks/linear/', LinearWebhookView.as_view(), name='linear-webhook'),
]

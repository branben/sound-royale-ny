from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RoomViewSet,
    PlayerViewSet,
    TileViewSet,
    ThemeRotationViewSet,
    genre_performance_by_player_id,
    set_checked_in_by_player_id,
    discord_auth,
    discord_callback,
    discord_link_account,
    discord_unlink_account,
    discord_account_status,
)
from .webhooks import LinearWebhookView

router = DefaultRouter()
router.register(r'rooms', RoomViewSet)
router.register(r'players', PlayerViewSet)
router.register(r'tiles', TileViewSet)
router.register(r'theme-rotations', ThemeRotationViewSet, basename='theme-rotation')

urlpatterns = [
    # Discord OAuth endpoints (must be before router to avoid conflicts)
    path('api/auth/discord/', discord_auth, name='discord-auth'),
    path('api/auth/discord/callback/', discord_callback, name='discord-callback'),
    path('api/auth/discord/link/', discord_link_account, name='discord-link'),
    path('api/auth/discord/unlink/', discord_unlink_account, name='discord-unlink'),
    path('api/auth/discord/status/', discord_account_status, name='discord-status'),
    path(
        'api/players/by-id/<uuid:player_id>/genre_performance/',
        genre_performance_by_player_id,
        name='player-genre-performance-by-id',
    ),
    path(
        'api/players/by-id/<uuid:player_id>/set_checked_in/',
        set_checked_in_by_player_id,
        name='player-set-checked-in-by-id',
    ),
    path('api/', include(router.urls)),
    path('webhooks/linear/', LinearWebhookView.as_view(), name='linear-webhook'),
]

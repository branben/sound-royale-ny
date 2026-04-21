"""
URL configuration for GameSessionViewSet demonstrating multiple lookup field patterns
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .game_session_views import GameSessionViewSet

# Create router for GameSessionViewSet
router = DefaultRouter()
router.register(r'game-sessions', GameSessionViewSet, basename='game-session')

# Custom URL patterns for multiple lookup field support
app_name = 'game_session'

urlpatterns = [
    # Standard routes with default lookup field (room code)
    path('', include(router.urls)),
    
    # Additional custom routes for different lookup patterns
    path('game-sessions/by-uuid/<uuid:room_uuid>/', 
         GameSessionViewSet.as_view({'get': 'by_uuid'}), 
         name='game-session-by-uuid'),
    
    path('game-sessions/by-player/<uuid:player_secret>/', 
         GameSessionViewSet.as_view({'get': 'by_player'}), 
         name='game-session-by-player'),
]

# URL pattern examples:
# Standard: /api/game-sessions/1234/ (lookup by room code)
# UUID: /api/game-sessions/by-uuid/<room-uuid>/ (lookup by room UUID)
# Player: /api/game-sessions/by-player/<player-secret>/ (lookup by player secret)
# Players: /api/game-sessions/1234/players/ (get all players for room)
# Tiles: /api/game-sessions/1234/tiles/ (get all tiles for room)
# Stats: /api/game-sessions/1234/session-stats/ (get session statistics)
# Join: /api/game-sessions/1234/join-as-spectator/ (join as spectator)
# Status: /api/game-sessions/1234/quick-status-check/ (quick status)
# Active: /api/game-sessions/active-sessions/ (list active sessions)
# Cleanup: /api/game-sessions/1234/force-cleanup/ (admin cleanup)

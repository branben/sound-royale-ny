# Refactored views.py - now imports from specialized modules
# This file serves as the central import location for URL routing

from .views_auth import (
    RequestLoginCodeView,
    VerifyLoginCodeView,
    MeView,
    LogoutView,
    GlobalLeaderboardView,
)
from .views_game import RoomViewSet, PlayerViewSet, TileViewSet
from .views_elo import EloLedgerMeView, EloSummaryMeView, EloUserSummaryView
from .views_discord import DiscordOAuthStartView, DiscordOAuthCallbackView

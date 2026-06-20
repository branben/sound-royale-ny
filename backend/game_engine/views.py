from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from django.db import transaction, IntegrityError
from django.db.models import Prefetch
from django.utils import timezone
from django.conf import settings
from itertools import groupby
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import random
import asyncio
import json
import logging
import os

logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("game_audit")

from .models import Room, Player, Tile, Round, Vote, ThemeRotation, DiscordAccount
from .discord_service import DiscordOAuthService
from .serializers import (
    RoomSerializer,
    RoomDetailSerializer,
    RoomCreateSerializer,
    TileSerializer,
    PlayerSerializer,
    PlayerCreateSerializer,
    GameStateSerializer,
    VoteSerializer,
    RoundSerializer,
    ThemeRotationSerializer,
    GenrePerformanceSerializer,
)
from .bingo_utils import check_bingo_lines, calculate_bingo_score, check_tie_breaker, get_theme_genres


DEFAULT_THEME_ROTATIONS = {
    "classic": {
        "name": "Classic",
        "description": "theme by @1120cooks",
        "genres": ["Phonk", "Trap", "Lo-Fi", "House", "Drill", "R&B", "EDM", "Jazz", "Ambient"],
    },
    "weekly": {
        "name": "Weekly Rotation",
        "description": "theme by @1120cooks",
        "genres": ["Trap", "Phonk", "Drill", "R&B", "EDM", "House", "Lo-Fi", "Jazz", "Ambient"],
    },
    "monthly": {
        "name": "Monthly Rotation",
        "description": "theme by @1120cooks",
        "genres": ["House", "EDM", "Techno", "Disco", "Lo-Fi", "R&B", "Trap", "Phonk", "Ambient"],
    },
}


# Core genres that match the frontend GENRES constant
CORE_GENRES = ["phonk", "trap", "lofi", "house", "drill", "rnb", "edm", "jazz", "ambient"]


def build_genre_performance(player):
    """Build FIFA-style genre performance stats for a player."""
    player_rooms = Room.objects.filter(players=player)
    rounds = Round.objects.filter(room__in=player_rooms)

    # Get all distinct genres from rounds (historical genres)
    historical_genres = list(
        rounds.values_list("current_tile_genre", flat=True)
        .distinct()
        .order_by("current_tile_genre")
    )

    # Union with core genres from Tile.Genre.choices
    all_genres = set(Tile.Genre.choices[i][0] for i in range(len(Tile.Genre.choices)))
    all_genres.update(historical_genres)

    genre_stats = {}
    for genre in all_genres:
        # Normalize genre to lowercase for legacy check (case-insensitive comparison)
        genre_lower = genre.lower()
        genre_rounds = rounds.filter(current_tile_genre=genre)

        total_rounds = genre_rounds.count()
        if total_rounds == 0:
            genre_stats[genre] = {
                "genre": genre,
                "wins": 0,
                "total_rounds": 0,
                "win_rate": 0.0,
                "grade": "N/A",
                "is_legacy": genre_lower not in CORE_GENRES,
            }
            continue

        wins = genre_rounds.filter(winner=player).count()
        win_rate = round((wins / total_rounds) * 100, 2)

        if win_rate >= 80:
            grade = "S"
        elif win_rate >= 70:
            grade = "A"
        elif win_rate >= 60:
            grade = "B"
        elif win_rate >= 50:
            grade = "C"
        elif win_rate >= 40:
            grade = "D"
        elif win_rate >= 30:
            grade = "E"
        else:
            grade = "F"

        genre_stats[genre] = {
            "genre": genre,
            "wins": wins,
            "total_rounds": total_rounds,
            "win_rate": win_rate,
            "grade": grade,
            "is_legacy": genre_lower not in CORE_GENRES,
        }

    performance_data = list(genre_stats.values())

    # Sort: core genres first (in CORE_GENRES order), then historical by total_rounds descending
    def sort_key(item):
        genre_lower = item["genre"].lower()
        if genre_lower in CORE_GENRES:
            # Core genres: sort by CORE_GENRES order
            return (0, CORE_GENRES.index(genre_lower))
        else:
            # Historical genres: sort by total_rounds descending
            return (1, -item["total_rounds"])

    performance_data.sort(key=sort_key)
    return performance_data


@api_view(["GET"])
def genre_performance_by_player_id(request, player_id):
    """Public genre performance endpoint keyed by stable player id."""
    player = get_object_or_404(Player, id=player_id)
    serializer = GenrePerformanceSerializer(build_genre_performance(player), many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["POST"])
def verify_admin_pin(request):
    """Verify an admin PIN. Returns 200 if valid, 403 if not."""
    configured_secret = getattr(settings, "THEME_ADMIN_SECRET", "")
    provided_secret = request.data.get("pin", "") or request.headers.get("X-Theme-Admin-Secret", "")
    if not configured_secret:
        return Response(
            {"valid": False, "error": "Admin PIN is not configured"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if provided_secret != configured_secret:
        return Response(
            {"valid": False, "error": "Invalid admin PIN"},
            status=status.HTTP_403_FORBIDDEN,
        )
    return Response({"valid": True})


@api_view(["POST"])
def set_checked_in_by_player_id(request, player_id):
    """Admin endpoint for idempotently assigning Checked In status."""
    configured_secret = getattr(settings, "THEME_ADMIN_SECRET", "")
    provided_secret = request.headers.get("X-Theme-Admin-Secret", "")
    if not configured_secret or provided_secret != configured_secret:
        return Response(
            {"error": "Invalid theme admin secret"},
            status=status.HTTP_403_FORBIDDEN,
        )

    player = get_object_or_404(Player, id=player_id)
    player.is_checked_in = bool(request.data.get("is_checked_in", False))
    player.save(update_fields=["is_checked_in"])
    serializer = PlayerSerializer(player)
    return Response(serializer.data, status=status.HTTP_200_OK)


def get_vote_resolution(current_round):
    votes_for = {}
    checked_in_votes_for = set()
    for vote in current_round.votes.select_related("voter", "voted_for").all():
        voted_for_id = str(vote.voted_for.id)
        votes_for[voted_for_id] = votes_for.get(voted_for_id, 0) + 1
        if vote.voter.is_checked_in:
            checked_in_votes_for.add(voted_for_id)

    if not votes_for:
        return None

    max_votes = max(votes_for.values())
    winners = [pid for pid, count in votes_for.items() if count == max_votes]
    return {
        "votes_for": votes_for,
        "max_votes": max_votes,
        "winners": winners,
        "checked_in_votes_for": checked_in_votes_for,
    }


def has_consecutive_round_wins(room, winner, current_round, streak_length=2):
    resolved_rounds = list(
        Round.objects.filter(room=room, round_number__lte=current_round.round_number)
        .exclude(winner__isnull=True)
        .order_by("-round_number")
    )
    streak = 0
    for round_obj in resolved_rounds:
        if round_obj.winner_id != winner.id:
            break
        streak += 1
        if streak >= streak_length:
            return True
    return False


def has_ranked_three_round_sweep(room, winner, current_round, is_ranked):
    if not is_ranked or room.total_rounds != 3 or current_round.round_number != 3:
        return False

    resolved_rounds = list(
        Round.objects.filter(room=room, round_number__lte=3)
        .exclude(winner__isnull=True)
        .order_by("round_number")
    )
    return len(resolved_rounds) == 3 and all(
        round_obj.winner_id == winner.id for round_obj in resolved_rounds
    )


def ensure_theme_rotations():
    for key, defaults in DEFAULT_THEME_ROTATIONS.items():
        ThemeRotation.objects.get_or_create(key=key, defaults=defaults)


def get_discord_account_from_session(data):
    """Return a DiscordAccount verified by stable browser session fields."""
    discord_user_id = data.get("discord_user_id")
    discord_session_secret = data.get("discord_session_secret")

    if not discord_user_id and not discord_session_secret:
        return None, None

    if not discord_user_id or not discord_session_secret:
        return None, Response(
            {"error": "discord_user_id and discord_session_secret are required together"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        return DiscordAccount.objects.get(
            discord_user_id=discord_user_id,
            session_secret=discord_session_secret,
        ), None
    except DiscordAccount.DoesNotExist:
        return None, Response(
            {"error": "Invalid Discord session"},
            status=status.HTTP_401_UNAUTHORIZED,
        )


def attach_discord_identity_from_session(player, data):
    discord_account, error_response = get_discord_account_from_session(data)
    if error_response is not None:
        return error_response

    if discord_account is not None:
        player.discord_identity = discord_account
        player.save(update_fields=["discord_identity"])

    return None


def normalize_genre(value):
    """Normalize a genre string for comparison. Pure utility, no side effects."""
    normalized = "".join(char for char in str(value).lower() if char.isalnum())
    return "rb" if normalized == "rnb" else normalized


def _resolve_bingo_and_winner(room, player):
    all_players_with_tiles = room.players.filter(
        is_spectator=False
    ).prefetch_related(
        Prefetch(
            "tiles",
            queryset=Tile.objects.filter(status=Tile.Status.COMPLETE),
            to_attr="completed_tiles",
        )
    )

    current_player_tiles = next(
        (
            p.completed_tiles
            for p in all_players_with_tiles
            if p.id == player.id
        ),
        [],
    )

    if len(current_player_tiles) >= 5:
        player_tiles = list(current_player_tiles)
        completed_lines = check_bingo_lines(player_tiles)

        if completed_lines:
            score_info = calculate_bingo_score(player, completed_lines)

            player_scores = []

            for other_player in all_players_with_tiles:
                if other_player.id == player.id:
                    continue

                other_completed_tiles = other_player.completed_tiles

                if other_completed_tiles:
                    other_tiles_list = list(other_completed_tiles)
                    other_completed_lines = check_bingo_lines(other_tiles_list)

                    if other_completed_lines:
                        other_score_info = calculate_bingo_score(
                            other_player, other_completed_lines
                        )
                        player_scores.append((other_player, other_score_info))

            if len(player_scores) == 0:
                room.status = Room.Status.FINISHED
                room.winner = player
                room.save()
            else:
                player_scores.append((player, score_info))
                winner = check_tie_breaker(player_scores)

                if winner:
                    room.status = Room.Status.FINISHED
                    room.winner = winner
                    room.save()


def broadcast_game_update(room):
    """
    Helper to broadcast game state updates to the room's channel group.
    """
    channel_layer = get_channel_layer()
    serializer = GameStateSerializer(room)
    async_to_sync(channel_layer.group_send)(
        f"game_{room.id}", {"type": "game_state_update", "payload": serializer.data}
    )


def broadcast_timer_tick(room):
    """
    Broadcast a timer_tick message to the room's channel group.
    """
    channel_layer = get_channel_layer()
    current_round = Round.objects.filter(room=room).first()
    if not current_round or not current_round.timer_ends_at:
        return

    now = timezone.now()
    if current_round.timer_ends_at <= now:
        time_remaining = 0
    else:
        time_remaining = int((current_round.timer_ends_at - now).total_seconds())

    async_to_sync(channel_layer.group_send)(
        f"game_{room.id}",
        {"type": "timer_tick", "payload": {"timeRemaining": time_remaining}},
    )


_active_timer_tasks: dict[str, asyncio.Task] = {}

async def _timer_loop(room_id: str, duration: int, channel_layer):
    try:
        for remaining in range(duration, -1, -1):
            await channel_layer.group_send(
                f"game_{room_id}",
                {"type": "timer_tick", "payload": {"timeRemaining": remaining}},
            )
            if remaining > 0:
                await asyncio.sleep(1)
    except asyncio.CancelledError:
        pass
    finally:
        _active_timer_tasks.pop(room_id, None)

def start_timer_broadcast(room_id: str, duration: int):
    cancel_timer_broadcast(room_id)
    from channels.layers import get_channel_layer
    channel_layer = get_channel_layer()
    # Run the timer loop in a background thread with its own event loop,
    # because this function is called from sync DRF views where no
    # event loop is running.
    loop = asyncio.new_event_loop()
    task = loop.create_task(_timer_loop(room_id, duration, channel_layer))
    _active_timer_tasks[room_id] = task

    import threading

    def _run_loop():
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(task)
        except (asyncio.CancelledError, Exception):
            pass
        finally:
            loop.close()

    t = threading.Thread(target=_run_loop, daemon=True)
    t.start()

def cancel_timer_broadcast(room_id: str):
    task = _active_timer_tasks.pop(room_id, None)
    if task and not task.done():
        task.cancel()


class ThemeRotationViewSet(viewsets.ModelViewSet):
    serializer_class = ThemeRotationSerializer
    permission_classes = [AllowAny]
    lookup_field = "key"
    http_method_names = ["get", "put", "head", "options"]

    def get_queryset(self):
        ensure_theme_rotations()
        return ThemeRotation.objects.filter(key__in=DEFAULT_THEME_ROTATIONS.keys()).order_by("id")

    def update(self, request, *args, **kwargs):
        configured_secret = getattr(settings, "THEME_ADMIN_SECRET", "")
        provided_secret = request.headers.get("X-Theme-Admin-Secret", "")
        if not configured_secret or provided_secret != configured_secret:
            return Response(
                {"error": "Invalid theme admin secret"},
                status=status.HTTP_403_FORBIDDEN,
            )

        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class RoomViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing game rooms.
    """

    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [AllowAny]
    lookup_field = "code"  # Allow lookup by 4-digit room code
    throttle_scope = "room_creation"

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action == "create":
            throttles.append(ScopedRateThrottle())
        return throttles

    def get_object(self):
        if self.kwargs.get(self.lookup_field):
            # Try to get by room code first
            try:
                return Room.objects.get(code=str(self.kwargs[self.lookup_field]))
            except Room.DoesNotExist:
                # Fallback to UUID lookup if code lookup fails
                pass

        # Default behavior for UUID lookup
        return super().get_object()

    def get_serializer_class(self):
        if self.action == "create":
            return RoomCreateSerializer
        elif self.action in ["retrieve", "join_game", "start_game"]:
            return RoomDetailSerializer
        return RoomSerializer

    def create(self, request, *args, **kwargs):
        """Override create to return room_code, player_id, and player_secret.

        NOTE: player_secret is intentionally returned here (and in join_game) as
        this is the ONLY time it is issued to the client. It serves as the session
        auth token for all subsequent requests. It must NOT be returned by any
        other endpoint (list, retrieve, etc.).
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Create the room
        room = serializer.save()

        # Generate unique 4-digit room code
        while True:
            code = "".join(random.choices("0123456789", k=4))
            if not Room.objects.filter(code=code).exists():
                room.code = code
                room.save()
                break

        player_name = serializer.validated_data.get("player_name", "Host")
        player = Player.objects.create(
            room=room, name=player_name, is_spectator=False, is_host=True
        )
        discord_error = attach_discord_identity_from_session(player, request.data)
        if discord_error is not None:
            player.delete()
            room.delete()
            return discord_error

        # Use theme-based genre selection
        theme_genres = get_theme_genres(room)
        random.shuffle(theme_genres)
        genres = theme_genres[:9]

        for position in range(9):
            Tile.objects.create(
                player=player, room=room, position=position, genre=genres.pop()
            )

        return Response(
            {
                "room_code": room.code,
                "player_id": str(player.id),
                "player_secret": str(player.player_secret),
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def join_game(self, request, pk=None, code=None):
        """
        Join a game room as a player or spectator.
        """
        room = self.get_object()

        existing_names = set()
        try:
            with transaction.atomic():
                # Handle JSON parsing errors
                try:
                    data = request.data.copy()
                except Exception as e:
                    return Response(
                        {"error": "Invalid JSON format"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                is_spectator_join = data.get("is_spectator", False)
                if room.status != Room.Status.LOBBY and not (
                    is_spectator_join and room.status == Room.Status.PLAYING
                ):
                    return Response(
                        {"error": "Only spectators can join after a game has started"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                spectator_count = room.players.filter(is_spectator=True).count()
                if is_spectator_join:
                    if spectator_count >= 10:
                        return Response(
                            {"error": "Spectator limit reached (max 10)"},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                if is_spectator_join:
                    existing_names = set(
                        Player.objects.filter(room=room).values_list("name", flat=True)
                    )
                    spectator_num = 1
                    while f"Spectator {spectator_num}" in existing_names:
                        spectator_num += 1
                    data["name"] = f"Spectator {spectator_num}"
                else:
                    existing_names = set(
                        Player.objects.filter(room=room).values_list("name", flat=True)
                    )

                serializer = PlayerCreateSerializer(data=data, context={"room": room})
                if serializer.is_valid():
                    player = serializer.save()
                    discord_error = attach_discord_identity_from_session(player, data)
                    if discord_error is not None:
                        return discord_error

                    if not player.is_spectator:
                        # Use theme-based genre selection
                        theme_genres = get_theme_genres(room)
                        random.shuffle(theme_genres)
                        genres = theme_genres[:9]

                        for position in range(9):
                            tile = Tile.objects.create(
                                player=player,
                                position=position,
                                genre=genres.pop(),
                                room=room,
                            )

                    transaction.on_commit(lambda: broadcast_game_update(room))

                    return Response(
                        PlayerCreateSerializer(player).data,
                        status=status.HTTP_201_CREATED,
                    )

                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            conflicting_name = data.get("name", "Unknown")
            existing_conflicts = [
                name
                for name in existing_names
                if conflicting_name.lower() == str(name).lower()
            ]

            if existing_conflicts:
                return Response(
                    {
                        "error": f'Name "{conflicting_name}" is already taken in this room',
                        "conflict_type": "duplicate_name",
                        "existing_names": list(existing_names),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            else:
                raise
        except Exception as e:
            logger.exception(
                f"Failed to join room in room {room.code if 'room' in locals() else 'unknown'}"
            )
            return Response(
                {
                    "error": "Failed to join room. Please try again.",
                    "existing_names_in_room": list(existing_names)
                    if "existing_names" in locals()
                    else [],
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"])
    def toggle_ready(self, request, pk=None, code=None):
        """
        Toggle a player's ready status in this room.
        """
        room = self.get_object()
        player_id = request.data.get("player_id")
        player_secret = request.data.get("player_secret")

        if not player_id or not player_secret:
            return Response(
                {"error": "player_id and player_secret are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            player = Player.objects.get(id=player_id, room=room)
        except Player.DoesNotExist:
            return Response(
                {"error": "Player not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if str(player.player_secret) != str(player_secret):
            return Response(
                {"error": "Invalid player_secret"},
                status=status.HTTP_403_FORBIDDEN,
            )

        player.is_ready = not player.is_ready
        player.save(update_fields=["is_ready"])

        broadcast_game_update(room)

        return Response(
            {
                "player_id": str(player.id),
                "is_ready": player.is_ready,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def start_game(self, request, pk=None, code=None):
        """
        Start the game in a room. Only host can start.
        """
        room = self.get_object()

        requester_secret = request.data.get("player_secret")
        if not requester_secret:
            return Response(
                {"error": "player_secret is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            host = room.host
            if not host or str(host.player_secret) != requester_secret:
                return Response(
                    {"error": "Only host can start game"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception as e:
            return Response(
                {"error": "Failed to verify host permissions"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if room.status != Room.Status.LOBBY:
            return Response(
                {"error": "Game has already started"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        players = room.players.filter(is_spectator=False)
        if len(players) < 2:
            return Response(
                {"error": "Need at least 2 players to start"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Change room status
            room.status = Room.Status.PLAYING
            room.save()

            # Tiles are now created when players join, not when game starts

            # Create the first round with a random genre
            used_genres = set(
                Round.objects.filter(room=room).values_list(
                    "current_tile_genre", flat=True
                )
            )
            # Use theme-based genre selection
            theme_genres = get_theme_genres(room)
            available_genres = [g for g in theme_genres if g not in used_genres]
            if not available_genres:
                available_genres = theme_genres

            first_genre = random.choice(available_genres)

            timer_started = timezone.now()
            timer_ends = timer_started + timezone.timedelta(seconds=60)

            first_round = Round.objects.create(
                room=room,
                round_number=1,
                current_tile_genre=first_genre,
                timer_duration=60,
                timer_started_at=timer_started,
                timer_ends_at=timer_ends,
            )

        broadcast_game_update(room)
        broadcast_timer_tick(room)
        start_timer_broadcast(room.id, 60)

        return Response(
            {
                "status": "Game started",
                "first_round": RoundSerializer(first_round).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"])
    def game_state(self, request, pk=None, code=None):
        """
        Get the current game state.
        """
        room = self.get_object()
        serializer = GameStateSerializer(room)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def rejoin_game(self, request, pk=None, code=None):
        """
        Rejoin a game room using player_secret.
        Returns player data if secret matches, 404 if not found.
        """
        room = self.get_object()
        player_secret = request.data.get("player_secret")

        if not player_secret:
            return Response(
                {"error": "player_secret is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            player = Player.objects.get(room=room, player_secret=player_secret)
            return Response(
                {
                    "id": str(player.id),
                    "name": player.name,
                    "isSpectator": player.is_spectator,
                    "is_host": player.is_host,
                    "is_checked_in": player.is_checked_in,
                    "current_title": player.current_title,
                },
                status=status.HTTP_200_OK,
            )
        except Player.DoesNotExist:
            return Response(
                {"error": "Player not found with this secret"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=True, methods=["post"])
    def reset_game(self, request, pk=None, code=None):
        """
        Reset the game for a new round. Only host can reset.
        Transaction-safe with proper rollback on any failure.
        """
        room = self.get_object()
        requester_secret = request.data.get("player_secret")

        if not requester_secret:
            return Response(
                {"error": "player_secret is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            host = room.host
            if not host or str(host.player_secret) != requester_secret:
                return Response(
                    {"error": "Only host can reset game"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        except Exception as e:
            return Response(
                {"error": "Failed to verify host permissions"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            with transaction.atomic():
                # Validate room state before starting transaction
                if room.status == Room.Status.PLAYING:
                    # Check if there are active tiles that shouldn't be deleted
                    active_tiles = Tile.objects.filter(
                        player__room=room,
                        status=Tile.Status.COMPLETE
                    ).count()

                    if active_tiles > 0:
                        return Response(
                            {
                                "error": "Cannot reset game with completed tiles",
                                "active_tiles": active_tiles
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                # Store original state for potential rollback logging
                original_round = room.current_round
                original_status = room.status

                # Step 1: Delete existing tiles (atomic operation)
                deleted_count, _ = Tile.objects.filter(player__room=room).delete()

                # Step 2: Update room state
                room.status = Room.Status.LOBBY
                room.current_round += 1
                room.winner = None
                room.save()

                # Step 3: Get players and validate
                players = room.players.filter(is_spectator=False)
                if players.count() == 0:
                    raise ValueError("No active players found in room")

                # Step 4: Create new tiles for each player
                created_tiles = []
                # Use theme-based genre selection
                theme_genres = get_theme_genres(room)

                for player in players:
                    # Create a copy of genres for each player to ensure uniqueness
                    player_genres = theme_genres.copy()
                    random.shuffle(player_genres)

                    # Take first 9 genres for this player
                    selected_genres = player_genres[:9]

                    if len(selected_genres) < 9:
                        raise ValueError(f"Insufficient genres available for player {player.name}")

                    # Create tiles for this player
                    for position in range(9):
                        try:
                            tile = Tile.objects.create(
                                player=player,
                                room=room,
                                position=position,
                                genre=selected_genres[position]
                            )
                            created_tiles.append(tile)
                        except IntegrityError as e:
                            # This shouldn't happen with our validation, but handle it gracefully
                            raise ValueError(f"Failed to create tile at position {position} for player {player.name}: {str(e)}")

                # Step 5: Validate all tiles were created successfully
                expected_tiles = players.count() * 9
                if len(created_tiles) != expected_tiles:
                    raise ValueError(f"Expected {expected_tiles} tiles, only created {len(created_tiles)}")

                transaction.on_commit(lambda: broadcast_game_update(room))

                return Response(
                    {
                        "status": "Game reset successfully",
                        "round": room.current_round,
                        "tiles_created": len(created_tiles),
                        "players": players.count(),
                        "previous_round": original_round
                    },
                    status=status.HTTP_200_OK,
                )

        except ValueError as e:
            # Validation errors - don't rollback as no changes were made
            logger.warning(f"Validation error in reset_game for room {room.code}: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except IntegrityError as e:
            # Database constraint violation - transaction will automatically rollback
            logger.error(f"Database integrity error in reset_game for room {room.code}: {str(e)}")
            return Response(
                {"error": "Database constraint violation. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        except Exception as e:
            # Any other exception - transaction will automatically rollback
            logger.exception(f"Unexpected error in reset_game for room {room.code}")
            return Response(
                {"error": "Failed to reset game due to unexpected error. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"])
    def kick_player(self, request, pk=None, code=None):
        room = self.get_object()
        requester_secret = request.data.get("player_secret")
        target_player_id = request.data.get("player_id")

        if not requester_secret or not target_player_id:
            return Response(
                {"error": "player_secret and player_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            host = room.host
            if not host or str(host.player_secret) != requester_secret:
                return Response(
                    {"error": "Only host can kick players"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            try:
                target_player = room.players.get(id=target_player_id)
                if target_player == host:
                    return Response(
                        {"error": "Cannot kick the host"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                player_name = target_player.name
                target_player.delete()
                broadcast_game_update(room)

                return Response(
                    {"status": f"Player {player_name} kicked"},
                    status=status.HTTP_200_OK,
                )

            except Player.DoesNotExist:
                return Response(
                    {"error": "Player not found"}, status=status.HTTP_404_NOT_FOUND
                )

        except Exception as e:
            logger.exception(f"Failed to kick player in room {room.code}")
            return Response(
                {"error": "Failed to kick player. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"])
    def vote(self, request, **kwargs):
        """
        Cast a vote for a producer in the current round.
        Only spectators can vote, and only when voting is open.
        """
        room = self.get_object()

        player_secret = request.data.get("player_secret")
        voted_for_player_id = request.data.get("voted_for_player_id")

        if not player_secret or not voted_for_player_id:
            return Response(
                {"error": "player_secret and voted_for_player_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            voter = Player.objects.get(room=room, player_secret=player_secret)
        except Player.DoesNotExist:
            return Response(
                {"error": "Player not found with this secret"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not voter.is_spectator:
            return Response(
                {"error": "Only spectators can vote"},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            voted_for_player = room.players.get(id=voted_for_player_id)
            if voted_for_player.is_spectator:
                return Response(
                    {"error": "Cannot vote for a spectator"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Player.DoesNotExist:
            return Response(
                {"error": "Player being voted for not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        current_round = Round.objects.filter(room=room).first()
        if not current_round:
            return Response(
                {"error": "No active round in this room"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not current_round.voting_open:
            return Response(
                {"error": "Voting is not open for this round"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        spectator_count = room.players.filter(is_spectator=True).count()
        if spectator_count < 3:
            return Response(
                {"error": "Need at least 3 spectators for voting"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_vote = Vote.objects.filter(round=current_round, voter=voter).first()
        if existing_vote:
            return Response(
                {"error": "You have already voted in this round"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            vote = Vote.objects.create(
                round=current_round,
                voter=voter,
                voted_for=voted_for_player,
            )
            current_round.votes_recorded += 1
            current_round.save()

        audit_logger.info(
            "vote_cast",
            extra={
                "room_code": room.code,
                "voter_id": str(voter.id),
                "voter_name": voter.name,
                "voted_for_id": str(voted_for_player.id),
                "voted_for_name": voted_for_player.name,
                "round_number": current_round.round_number,
                "timestamp": timezone.now().isoformat(),
                "action": "vote_cast",
                "outcome": "success",
            },
        )

        broadcast_game_update(room)

        if current_round.votes_recorded >= spectator_count:
            return self._auto_advance_turn(room, current_round, spectator_count)

        return Response(
            VoteSerializer(vote).data,
            status=status.HTTP_201_CREATED,
        )

    def _resolve_ranked_round(self, room, current_round, spectator_count):
        resolution = get_vote_resolution(current_round)
        if not resolution:
            return {
                "response": Response(
                    {"error": "No votes recorded"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            }

        winners = resolution["winners"]
        if len(winners) > 1:
            current_round.voting_open = True
            current_round.votes_recorded = 0
            Vote.objects.filter(round=current_round).delete()
            current_round.save()
            broadcast_game_update(room)
            return {
                "response": Response(
                    {"error": "Tie vote - re-voting required", "tie": True},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            }

        winner_id = winners[0]
        winner = Player.objects.get(id=winner_id)

        current_round.winner = winner
        current_round.voting_open = False
        current_round.save(update_fields=["winner", "voting_open", "updated_at"])

        producers = list(room.players.filter(is_spectator=False).order_by("joined_at"))
        losers = [producer for producer in producers if producer.id != winner.id]
        elo_gain = 0
        sweeper_penalty = 0
        awarded_jackpot = False
        awarded_sweeper = False
        is_ranked = spectator_count >= 3

        if len(producers) >= 2:
            base_gain = 25
            max_votes = resolution["max_votes"]
            vote_margin = max_votes - (spectator_count - max_votes)
            if vote_margin == 1:
                multiplier = 1.5
            elif vote_margin == spectator_count:
                multiplier = 2.0
            else:
                multiplier = 1.0

            elo_gain = int(base_gain * multiplier)
            if winner_id in resolution["checked_in_votes_for"]:
                elo_gain = int(elo_gain * 1.2)

            if has_consecutive_round_wins(room, winner, current_round):
                if not winner.earned_jackpot:
                    winner.earned_jackpot = True
                    awarded_jackpot = True
                elo_gain += 10

            if has_ranked_three_round_sweep(room, winner, current_round, is_ranked):
                if not winner.earned_sweeper:
                    winner.earned_sweeper = True
                    awarded_sweeper = True
                sweeper_penalty = 20

            winner.elo_rating += elo_gain
            winner.elo_wins += 1
            winner.elo_matches += 1

            for loser in losers:
                loser.elo_rating = max(100, loser.elo_rating - elo_gain - sweeper_penalty)
                loser.elo_losses += 1
                loser.elo_matches += 1

            winner.save(
                update_fields=[
                    "elo_rating",
                    "elo_wins",
                    "elo_matches",
                    "earned_jackpot",
                    "earned_sweeper",
                ]
            )
            for loser in losers:
                loser.save(update_fields=["elo_rating", "elo_losses", "elo_matches"])

            audit_logger.info(
                "elo_updated",
                extra={
                    "room_code": room.code,
                    "round_number": current_round.round_number,
                    "winner_id": str(winner.id),
                    "winner_name": winner.name,
                    "winner_new_rating": winner.elo_rating,
                    "elo_gained": elo_gain,
                    "sweeper_penalty": sweeper_penalty,
                    "loser_ids": [str(loser.id) for loser in losers],
                    "awarded_jackpot": awarded_jackpot,
                    "awarded_sweeper": awarded_sweeper,
                    "timestamp": timezone.now().isoformat(),
                    "action": "elo_update",
                    "outcome": "success",
                },
            )

        return {
            "response": None,
            "winner": winner,
            "elo_gain": elo_gain,
            "sweeper_penalty": sweeper_penalty,
        }

    @action(detail=True, methods=["post"])
    def next_turn(self, request, pk=None, code=None):
        """
        Advance to the next round/tile after voting is complete.
        Only host can trigger this.
        """
        room = self.get_object()

        requester_secret = request.data.get("player_secret")
        if not requester_secret:
            return Response(
                {"error": "player_secret is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            host = room.host
            if not host or str(host.player_secret) != requester_secret:
                return Response(
                    {"error": "Only host can advance the turn"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Player.DoesNotExist:
            return Response(
                {"error": "Host not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        current_round = Round.objects.filter(room=room).first()
        if not current_round:
            return Response(
                {"error": "No active round in this room"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        spectator_count = room.players.filter(is_spectator=True).count()
        is_ranked = spectator_count >= 3
        resolution_result = None

        if is_ranked and current_round.voting_open:
            if current_round.votes_recorded < spectator_count:
                return Response(
                    {"error": "Waiting for all spectators to vote"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            resolution_result = self._resolve_ranked_round(
                room, current_round, spectator_count
            )
            if resolution_result["response"] is not None:
                return resolution_result["response"]

        producers = room.players.filter(is_spectator=False)
        if producers.count() < 2:
            return Response(
                {"error": "Need at least 2 producers to continue"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        used_genres = set(
            Round.objects.filter(room=room).values_list("current_tile_genre", flat=True)
        )
        # Use theme-based genre selection
        theme_genres = get_theme_genres(room)
        available_genres = [g for g in theme_genres if g not in used_genres]
        if not available_genres:
            available_genres = theme_genres

        next_genre = random.choice(available_genres)
        next_round_number = room.current_round + 1

        if room.total_rounds and next_round_number > room.total_rounds:
            room.status = Room.Status.FINISHED
            room.save(update_fields=["status"])
            broadcast_game_update(room)
            return Response(
                {
                    "status": "Game finished",
                    "reason": "All rounds completed",
                    "final_round": room.current_round,
                    "total_rounds": room.total_rounds,
                    "winner": resolution_result["winner"].name if resolution_result else None,
                    "elo_gained": resolution_result["elo_gain"] if resolution_result else 0,
                },
                status=status.HTTP_200_OK,
            )

        timer_started = timezone.now()
        timer_ends = timer_started + timezone.timedelta(seconds=60)

        with transaction.atomic():
            new_round = Round.objects.create(
                room=room,
                round_number=next_round_number,
                current_tile_genre=next_genre,
                timer_duration=60,
                timer_started_at=timer_started,
                timer_ends_at=timer_ends,
            )
            room.current_round = next_round_number
            room.save()

        broadcast_game_update(room)
        broadcast_timer_tick(room)
        start_timer_broadcast(room.id, 60)

        return Response(
            {
                "status": "Advanced to next round",
                "new_round": RoundSerializer(new_round).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def open_voting(self, request, **kwargs):
        """
        Open voting for spectators after timer ends.
        """
        room = self.get_object()

        requester_secret = request.data.get("player_secret")
        if not requester_secret:
            return Response(
                {"error": "player_secret is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            host = room.host
            if not host or str(host.player_secret) != requester_secret:
                return Response(
                    {"error": "Only host can open voting"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Player.DoesNotExist:
            return Response(
                {"error": "Host not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        current_round = Round.objects.filter(room=room).first()
        if not current_round:
            return Response(
                {"error": "No active round in this room"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if current_round.voting_open:
            return Response(
                {"error": "Voting is already open"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        spectator_count = room.players.filter(is_spectator=True).count()
        if spectator_count < 3:
            return Response(
                {
                    "error": "Need at least 3 spectators for voting (casual mode - no voting)"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            current_round.voting_open = True
            current_round.save()

        audit_logger.info(
            "voting_opened",
            extra={
                "room_code": room.code,
                "round_number": current_round.round_number,
                "spectator_count": spectator_count,
                "timestamp": timezone.now().isoformat(),
                "action": "open_voting",
                "outcome": "success",
            },
        )

        broadcast_game_update(room)

        return Response(
            {
                "status": "Voting opened",
                "round": RoundSerializer(current_round).data,
            },
            status=status.HTTP_200_OK,
        )

    def _auto_advance_turn(self, room, current_round, spectator_count):
        """
        Automatically advance to next turn when all spectators have voted.
        Determines winner and advances the round.
        """
        resolution_result = self._resolve_ranked_round(
            room, current_round, spectator_count
        )
        if resolution_result["response"] is not None:
            return resolution_result["response"]

        used_genres = set(
            Round.objects.filter(room=room).values_list("current_tile_genre", flat=True)
        )
        # Use theme-based genre selection
        theme_genres = get_theme_genres(room)
        available_genres = [g for g in theme_genres if g not in used_genres]
        if not available_genres:
            available_genres = theme_genres

        next_genre = random.choice(available_genres)
        next_round_number = room.current_round + 1

        if room.total_rounds and next_round_number > room.total_rounds:
            room.status = Room.Status.FINISHED
            room.save(update_fields=["status"])
            broadcast_game_update(room)
            return Response(
                {
                    "status": "Game finished",
                    "reason": "All rounds completed",
                    "final_round": room.current_round,
                    "total_rounds": room.total_rounds,
                    "winner": resolution_result["winner"].name,
                    "elo_gained": resolution_result["elo_gain"],
                },
                status=status.HTTP_200_OK,
            )

        timer_started = timezone.now()
        timer_ends = timer_started + timezone.timedelta(seconds=60)

        new_round = Round.objects.create(
            room=room,
            round_number=next_round_number,
            current_tile_genre=next_genre,
            timer_duration=60,
            timer_started_at=timer_started,
            timer_ends_at=timer_ends,
        )
        room.current_round = next_round_number
        room.save()

        broadcast_game_update(room)
        broadcast_timer_tick(room)
        start_timer_broadcast(room.id, 60)

        return Response(
            {
                "status": "Advanced to next round",
                "new_round": RoundSerializer(new_round).data,
                "winner": resolution_result["winner"].name,
                "elo_gained": resolution_result["elo_gain"],
            },
            status=status.HTTP_200_OK,
        )


class PlayerViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing players.
    """

    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    permission_classes = [AllowAny]
    lookup_field = "player_secret"  # Allow lookup by player secret

    def get_serializer_class(self):
        if self.action == "create":
            return PlayerCreateSerializer  # Use create serializer for direct player creation
        return PlayerSerializer

    def get_object(self):
        """
        Override get_object to handle player_secret lookup
        """
        if self.kwargs.get(self.lookup_field):
            try:
                return Player.objects.get(player_secret=self.kwargs[self.lookup_field])
            except Player.DoesNotExist:
                pass
        return super().get_object()

    @action(detail=True, methods=["post"])
    def toggle_ready(self, request, pk=None, player_secret=None):
        """
        Toggle player ready status in lobby.
        """
        player = self.get_object()

        # Verify player_secret matches
        provided_secret = request.data.get("player_secret")
        if not provided_secret or str(player.player_secret) != str(provided_secret):
            return Response(
                {"error": "Invalid player_secret"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Toggle ready status
        player.is_ready = not player.is_ready
        player.save()

        # Broadcast update to all players
        if player.room:
            broadcast_game_update(player.room)

        return Response(
            {
                "player_id": str(player.id),
                "is_ready": player.is_ready
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=["post"])
    def update_score(self, request, pk=None, player_secret=None):
        """
        Update player score (for future ELO implementation)
        """
        player = self.get_object()

        score_delta = request.data.get('score_delta', 0)
        if not isinstance(score_delta, (int, float)):
            return Response(
                {"error": "score_delta must be a number"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # For now, just return success - ELO implementation would go here
        return Response(
            {
                "status": "Score update received",
                "player": player.name,
                "score_delta": score_delta
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=["post"])
    def toggle_connection(self, request, pk=None, player_secret=None):
        """
        Toggle player connection status
        """
        player = self.get_object()

        # Toggle connection status
        player.is_connected = not player.is_connected
        player.save()

        if player.room:
            broadcast_game_update(player.room)

        return Response(
            {
                "status": "Connection toggled",
                "player": player.name,
                "is_connected": player.is_connected
            },
            status=status.HTTP_200_OK
        )

    def perform_create(self, serializer):
        """
        Override to ensure room is set when creating players directly.
        This handles the case where players are created via PlayerViewSet.create()
        """
        # Get room from request data
        room_id = self.request.data.get("room_id")
        if room_id:
            from .models import Room
            room = Room.objects.get(id=room_id)
            # Provide room context to serializer (serializer.create() will handle room assignment)
            serializer.context['room'] = room
            serializer.save()
        else:
            raise serializers.ValidationError("room_id is required")

    @action(detail=True, methods=["get"])
    def genre_performance(self, request, pk=None):
        """
        Get genre performance stats for a player with FIFA-style grades.
        Computes win rate per genre based on historical round data.
        """
        player = self.get_object()
        serializer = GenrePerformanceSerializer(build_genre_performance(player), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def leave_game(self, request, pk=None, code=None):
        """
        Leave a game room.
        """
        player = self.get_object()
        if not player.room:
            player.delete()
            return Response({"status": "Left"}, status=status.HTTP_200_OK)

        room = player.room

        if room.status == Room.Status.PLAYING and not player.is_spectator:
            return Response(
                {"error": "Cannot leave a game in progress"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player.delete()

        # If no players left, delete the room
        if room.players.count() == 0:
            room.delete()
            return Response({"status": "Room deleted"}, status=status.HTTP_200_OK)

        return Response({"status": "Left game"}, status=status.HTTP_200_OK)


class TileViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing game tiles.
    """

    queryset = Tile.objects.all()
    serializer_class = TileSerializer
    permission_classes = [AllowAny]
    throttle_scope = "audio_upload"

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action == "play_tile":
            throttles.append(ScopedRateThrottle())
        return throttles

    @action(detail=True, methods=["post"])
    def play_tile(self, request, pk=None, code=None):
        """
        Play a tile in the game.
        """
        tile = self.get_object()
        room = tile.room

        if room.status != Room.Status.PLAYING:
            return Response(
                {"error": "Game is not in progress"}, status=status.HTTP_400_BAD_REQUEST
            )

        if tile.status != Tile.Status.EMPTY:
            return Response(
                {"error": "Tile has already been played"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player_id = request.data.get("player_id")
        try:
            player = Player.objects.get(id=player_id, room=room, is_spectator=False)
        except Player.DoesNotExist:
            return Response(
                {"error": "Invalid player"}, status=status.HTTP_400_BAD_REQUEST
            )

        if tile.player_id != player.id:
            return Response(
                {"error": "This tile does not belong to the player"},
                status=status.HTTP_403_FORBIDDEN,
            )

        current_round = Round.objects.filter(
            room=room,
            round_number=room.current_round,
        ).first()
        if current_round:
            if normalize_genre(tile.genre) != normalize_genre(current_round.current_tile_genre):
                return Response(
                    {"error": f"Tile genre '{tile.genre}' does not match current round genre '{current_round.current_tile_genre}'"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        ALLOWED_AUDIO_MIME_TYPES = {
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/ogg",
            "audio/flac",
            "audio/mp4",
            "audio/x-m4a",
            "audio/aac",
        }
        audio_file = request.FILES.get("audio_file")
        if not audio_file:
            return Response(
                {"error": "No audio file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if audio_file:
            if audio_file.size > settings.MAX_UPLOAD_SIZE:
                return Response(
                    {"error": f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if audio_file.content_type not in ALLOWED_AUDIO_MIME_TYPES:
                return Response(
                    {"error": f"Invalid file type '{audio_file.content_type}'. Allowed types: mp3, wav, ogg, flac, m4a, aac."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            tile.status = Tile.Status.COMPLETE
            if audio_file:
                tile.audio_file = audio_file
            tile.save()

            # Check for bingo lines and resolve winner
            _resolve_bingo_and_winner(room, player)

            transaction.on_commit(lambda: broadcast_game_update(room))

        # Return updated game state
        game_serializer = GameStateSerializer(room)
        return Response(game_serializer.data, status=status.HTTP_200_OK)


# Discord OAuth2 Endpoints
@api_view(["GET"])
def discord_auth(request):
    """
    Initiate Discord OAuth2 flow.
    Returns the authorization URL for the frontend to redirect to.
    """
    import secrets
    from django.core.cache import cache

    # Generate a state parameter for CSRF protection
    state = secrets.token_urlsafe(32)

    # Store state in cache for validation during callback
    cache.set(f"discord_oauth_state_{state}", True, timeout=600)  # 10 minutes

    discord_service = DiscordOAuthService()
    auth_url = discord_service.get_authorization_url(state)

    return Response(
        {"authorization_url": auth_url, "state": state},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
def discord_callback(request):
    """
    Handle Discord OAuth2 callback.
    Exchanges the authorization code for tokens and retrieves user info.
    """
    code = request.GET.get("code")
    state = request.GET.get("state")

    if not code or not state:
        return Response(
            {"error": "Missing code or state parameter"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate state parameter
    from django.core.cache import cache
    if not cache.get(f"discord_oauth_state_{state}"):
        return Response(
            {"error": "Invalid or expired state parameter"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Clear the state from cache
    cache.delete(f"discord_oauth_state_{state}")

    try:
        discord_service = DiscordOAuthService()

        # Exchange code for tokens
        token_data = discord_service.exchange_code_for_token(code)

        # Get user info from Discord
        user_info = discord_service.get_user_info(token_data["access_token"])

        return Response(
            {
                "discord_user_id": user_info["id"],
                "discord_username": user_info["username"],
                "discriminator": user_info.get("discriminator", ""),
                "avatar": user_info.get("avatar"),
                "access_token": token_data["access_token"],
                "refresh_token": token_data.get("refresh_token"),
                "expires_in": token_data.get("expires_in", 3600),
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        logger.error(f"Discord OAuth callback error: {e}", exc_info=True)
        return Response(
            {"error": "Failed to complete OAuth flow"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
def discord_link_account(request):
    """
    Link Discord account to a Sound Royale player.
    """
    player_id = request.data.get("player_id")
    player_secret = request.data.get("player_secret")
    discord_user_id = request.data.get("discord_user_id")
    discord_username = request.data.get("discord_username")
    discord_avatar_url = request.data.get("discord_avatar_url")
    access_token = request.data.get("access_token")
    refresh_token = request.data.get("refresh_token")
    expires_in = request.data.get("expires_in", 3600)

    if not all([player_id, player_secret, discord_user_id, access_token]):
        return Response(
            {"error": "Missing required fields"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Find existing player or create one on-the-fly for Discord linking
    player = Player.objects.filter(id=player_id, player_secret=player_secret).first()
    if not player:
        try:
            player = Player.objects.create(
                id=player_id,
                player_secret=player_secret,
                name=discord_username or "Discord User",
                room=None,
            )
        except IntegrityError:
            return Response(
                {"error": "Player ID exists with different credentials"},
                status=status.HTTP_409_CONFLICT,
            )

    try:
        discord_service = DiscordOAuthService()

        # Generate Discord avatar URL if avatar hash provided
        avatar_url = None
        if discord_avatar_url:
            avatar_url = f"https://cdn.discordapp.com/avatars/{discord_user_id}/{discord_avatar_url}.png"

        # Link the Discord account
        discord_account = discord_service.link_discord_account(
            player=player,
            discord_user_id=discord_user_id,
            discord_username=discord_username,
            discord_avatar_url=avatar_url,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
        )

        return Response(
            {
                "status": "Discord account linked successfully",
                "discord_user_id": discord_account.discord_user_id,
                "discord_username": discord_account.discord_username,
                "discord_avatar_url": discord_account.discord_avatar_url,
                "discord_session_secret": str(discord_account.session_secret),
                "linked_at": discord_account.linked_at,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        logger.error(f"Discord account linking error: {e}", exc_info=True)
        return Response(
            {"error": "Failed to link Discord account"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
def discord_unlink_account(request):
    """
    Unlink Discord account from a Sound Royale player.
    """
    player_id = request.data.get("player_id")
    player_secret = request.data.get("player_secret")

    if not player_id or not player_secret:
        return Response(
            {"error": "player_id and player_secret are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        # Verify player credentials
        player = Player.objects.get(id=player_id, player_secret=player_secret)
    except Player.DoesNotExist:
        return Response(
            {"error": "Invalid player credentials"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        discord_service = DiscordOAuthService()
        success = discord_service.unlink_discord_account(player)

        if success:
            return Response(
                {"status": "Discord account unlinked successfully"},
                status=status.HTTP_200_OK,
            )
        else:
            return Response(
                {"error": "No Discord account linked to this player"},
                status=status.HTTP_404_NOT_FOUND,
            )
    except Exception as e:
        logger.error(f"Discord account unlinking error: {e}", exc_info=True)
        return Response(
            {"error": "Failed to unlink Discord account"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
def discord_account_status(request):
    """
    Get Discord account linking status for a player.
    """
    player_id = request.GET.get("player_id")
    player_secret = request.GET.get("player_secret")
    discord_user_id = request.GET.get("discord_user_id")
    discord_session_secret = request.GET.get("discord_session_secret")

    discord_account = None
    if discord_user_id or discord_session_secret:
        discord_account, error_response = get_discord_account_from_session(request.GET)
        if error_response is not None:
            return error_response
    else:
        if not player_id or not player_secret:
            return Response(
                {"error": "player_id and player_secret are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            player = Player.objects.get(id=player_id, player_secret=player_secret)
        except Player.DoesNotExist:
            return Response(
                {"is_linked": False},
                status=status.HTTP_200_OK,
            )

        discord_service = DiscordOAuthService()
        discord_account = discord_service.get_discord_account(player)

    try:
        if discord_account:
            return Response(
                {
                    "is_linked": True,
                    "discord_user_id": discord_account.discord_user_id,
                    "discord_username": discord_account.discord_username,
                    "discord_avatar_url": discord_account.discord_avatar_url,
                    "discord_session_secret": str(discord_account.session_secret),
                    "linked_at": discord_account.linked_at,
                    "last_sync_at": discord_account.last_sync_at,
                    "privacy_settings": discord_account.privacy_settings,
                },
                status=status.HTTP_200_OK,
            )
        else:
            return Response(
                {"is_linked": False},
                status=status.HTTP_200_OK,
            )
    except Exception as e:
        logger.error(f"Discord account status check error: {e}", exc_info=True)
        return Response(
            {"error": "Failed to check Discord account status"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

ERROR_LOG_PATH = os.path.join(os.path.dirname(__file__), "error_log.jsonl")


@api_view(["POST"])
@permission_classes([AllowAny])
def log_client_error(request):
    """Accept error reports from the frontend and append to a JSONL file."""
    try:
        entry = {
            "timestamp": timezone.now().isoformat(),
            "path": request.data.get("path", ""),
            "method": request.data.get("method", ""),
            "status": request.data.get("status", 0),
            "message": request.data.get("message", ""),
            "stack": request.data.get("stack", ""),
            "component_stack": request.data.get("componentStack", ""),
            "user_agent": request.META.get("HTTP_USER_AGENT", ""),
        }
        with open(ERROR_LOG_PATH, "a") as f:
            f.write(json.dumps(entry) + "\n")
        return Response({"ok": True}, status=status.HTTP_201_CREATED)
    except Exception as e:
        logger.error(f"Failed to log client error: {e}")
        return Response({"error": "Failed to log error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

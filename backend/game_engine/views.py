import os

# Django REST views for the Sound Royale game engine (rooms, tiles, players,
# voting, ELO, and audit logging). See game_engine/ for the consumer/auth layer.

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
from django.contrib.auth import get_user_model

from rest_framework_simplejwt.tokens import RefreshToken
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

# Round duration in seconds. Override via SR_ROUND_SECONDS (e.g. for fast E2E).
ROUND_SECONDS = int(os.getenv("SR_ROUND_SECONDS", "60"))
import random
import asyncio
import json
import logging
import os

logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("game_audit")


def _sanitize_log(value):
    """Strip control characters (newlines/CRLF) from user-controlled data
    before it enters a log record, preventing log injection / forged entries."""
    if not isinstance(value, str):
        value = str(value)
    return value.replace("\r", "").replace("\n", "").strip()


from .models import (
    Room,
    Player,
    Tile,
    Round,
    Vote,
    BingoClaim,
    ThemeRotation,
    DiscordAccount,
)
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
from .security import hash_secret, is_hex64, new_player_secret


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
@permission_classes([AllowAny])
def genre_performance_by_player_id(request, player_id):
    """Public genre performance endpoint keyed by stable player id."""
    player = get_object_or_404(Player, id=player_id)
    serializer = GenrePerformanceSerializer(build_genre_performance(player), many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
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


def get_authenticated_player(player):
    """Create a Django User for the player if needed and return JWT tokens."""
    User = get_user_model()
    if not player.user:
        # Generate a deterministic username based on player UUID
        username = f"player_{player.id.hex[:12]}"
        # Ensure uniqueness (unlikely collision)
        user = User.objects.create(username=username)
        player.user = user
        player.save(update_fields=["user"])
    else:
        user = player.user
    refresh = RefreshToken.for_user(user)
    return {
        "access_token": str(refresh.access_token),
        "refresh_token": str(refresh),
    }


def resolve_player_from_request(request, room):
    """Resolve player from JWT or player_secret fallback.

    Priority:
    1. JWT: request.user.player (via Player.user OneToOneField)
    2. Fallback: player_id + player_secret from request body or headers

    Returns (player, error_response) — one will be None.
    """
    # Try JWT first
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        player = getattr(user, 'player', None)
        if player and player.room_id == room.id:
            return player, None

    # Fallback to player_secret in request body or headers
    player_id = request.data.get('player_id') or request.META.get('HTTP_X_PLAYER_ID')
    player_secret = request.data.get('player_secret') or request.META.get('HTTP_X_PLAYER_SECRET')

    if player_id and player_secret:
        try:
            player = Player.objects.get(id=player_id, room=room)
            # Incoming secret is the stored (hashed) value; only hash if
            # it is not already a hex digest (symmetric with Player.save()).
            sent = player_secret if is_hex64(player_secret) else hash_secret(player_secret)
            if player.player_secret != sent:
                return None, Response(
                    {"error": "Invalid player_secret"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return player, None
        except Player.DoesNotExist:
            return None, Response(
                {"error": "Player not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    # Legacy fallback: player_secret only (no player_id)
    if player_secret:
        secret_lookup = player_secret if is_hex64(player_secret) else hash_secret(player_secret)
        try:
            player = Player.objects.get(room=room, player_secret=secret_lookup)
            return player, None
        except Player.DoesNotExist:
            return None, Response(
                {"error": "Invalid player credentials"},
                status=status.HTTP_403_FORBIDDEN,
            )

    return None, Response(
        {"error": "Authentication required"},
        status=status.HTTP_403_FORBIDDEN,
    )


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
    return len(resolved_rounds) == Room.SWEEP_ROUNDS and all(
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
    if room.status == Room.Status.FINISHED:
        return

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

    if len(current_player_tiles) >= Room.MIN_TILES_FOR_BINGO_RESOLUTION:
        player_tiles = list(current_player_tiles)
        completed_lines = check_bingo_lines(player_tiles)

        if completed_lines:
            # Idempotent: get_or_create records the claim exactly once per
            # (room, player) — only when a real bingo line is achieved, not
            # on every tile completion.
            record_bingo_claim(room, player)
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


def record_bingo_claim(room, player):
    """Idempotently record a bingo claim for (room, player).

    Returns the BingoClaim if freshly created, or the existing one if the
    player already claimed bingo in this room. The unique_together on
    BingoClaim guarantees only one claim per (room, player) survives a race
    between concurrent claims.
    """
    claim, _created = BingoClaim.objects.get_or_create(room=room, player=player)
    return claim


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


def start_timer_broadcast(room_id, duration):
    """Start the timer broadcast loop for a room."""
    channel_layer = get_channel_layer()

    async def tick():
        while True:
            await asyncio.sleep(1)
            room = Room.objects.filter(id=room_id).first()
            if not room or room.status != Room.Status.PLAYING:
                break
            broadcast_timer_tick(room)

    async_to_sync(channel_layer.group_send)(
        f"game_{room_id}",
        {"type": "start_timer", "payload": {"duration": duration}},
    )


class RoomViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing game rooms.
    """

    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [AllowAny]
    lookup_field = "code"  # Allow lookup by 4-digit room code
    throttle_scope = "room_creation"
    # Security: disable generic write/delete routes. All room mutations must
    # go through the custom actions (start_game, reset_game, next_turn, etc.)
    # which enforce lobby status and spectator-count limits. See security
    # finding room_crud_open.
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return RoomCreateSerializer
        elif self.action in ["retrieve", "join_game", "start_game"]:
            return RoomDetailSerializer
        return RoomSerializer

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

    def create(self, request, *args, **kwargs):
        """Override create to return room_code, player_id, and player_secret.

        NOTE: player_secret is intentionally returned here (and in join_game) as
        this is the ONLY time it is issued to the client. It serves as the session
        auth token for all subsequent requests. It must NOT be returned by any
        other endpoint (list, retrieve, etc.).
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        player_name = serializer.validated_data.get("player_name", "Host")

        # Create the Room + host Player + initial tiles in a single atomic
        # transaction so a failure at any step rolls back everything (no
        # orphaned room with no host, no half-built board).
        with transaction.atomic():
            # Create the room
            room = serializer.save()

            # Generate unique 4-digit room code. The allocation is wrapped in
            # its own atomic block + IntegrityError retry so concurrent
            # create_room calls (e.g. parallel E2E workers) can never land on
            # the same code — a TOCTOU between .exists() and .save() would
            # otherwise let two rooms share a code and cross-contaminate joins.
            while True:
                code = "".join(random.choices("0123456789", k=4))
                try:
                    with transaction.atomic():
                        room.code = code
                        room.save()
                    break
                except IntegrityError:
                    continue

            # Generate the host's plaintext secret once; the model hashes it
            # on save, so capture the plaintext to return to the client
            # (the only time the secret is issued in plaintext — guardrail #105).
            host_secret = new_player_secret()
            player = Player.objects.create(
                room=room,
                name=player_name,
                is_spectator=False,
                is_host=True,
                player_secret=host_secret,
            )
            # Generate JWT tokens for the host player
            token_data = get_authenticated_player(player)

            # Use theme-based genre selection
            theme_genres = get_theme_genres(room)
            random.shuffle(theme_genres)
            genres = theme_genres[:9]

            for position in range(9):
                Tile.objects.create(
                    player=player, room=room, position=position, genre=genres.pop()
                )

        # Discord identity is attached OUTSIDE the atomic block so a failure here
        # doesn't roll back the room creation.
        try:
            attach_discord_identity_from_session(player, request.data)
        except Exception:
            pass  # Non-critical — don't fail room creation if Discord fails

        return Response(
            {
                "room_code": room.code,
                "player_id": str(player.id),
                "player_secret": host_secret,
                "access_token": token_data["access_token"],
                "refresh_token": token_data["refresh_token"],
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def join_game(self, request, pk=None, code=None):
        """
        Join a game room as a player or spectator.

        Retries the whole operation on transient DB errors (IntegrityError from
        duplicate key races under concurrency). Each attempt opens a fresh
        transaction, so aborted state from a prior attempt never leaks in.
        """
        MAX_JOIN_RETRIES = 5
        for attempt in range(MAX_JOIN_RETRIES):
            try:
                return self._do_join_game(request, pk=pk, code=code)
            except IntegrityError as e:
                logger.warning(
                    "join_game IntegrityError (attempt %d/%d): %s",
                    attempt + 1,
                    MAX_JOIN_RETRIES,
                    str(e)[:200],
                )
                continue
            except Exception as e:
                logger.exception(
                    "join_game unexpected error in room %s", code or pk
                )
                return Response(
                    {"error": "Failed to join room. Please try again."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        return Response(
            {"error": "Failed to join room after retries.", "conflict_type": "retry_exhausted"},
            status=status.HTTP_409_CONFLICT,
        )

    def _do_join_game(self, request, pk=None, code=None):
        """Inner join logic — runs inside the retry wrapper."""

        try:
            room = self.get_object()
        except Exception as e:
            logger.error(
                "join_game get_object failed: pk=%s code=%s error=%s",
                pk,
                code,
                e,
                exc_info=True,
            )
            return Response(
                {"error": "Room not found", "detail": str(e)},
                status=status.HTTP_404_NOT_FOUND,
            )

        existing_names = set()
        with transaction.atomic():
            # Lock the room row to serialize concurrent joins.
            # select_for_update() blocks other transactions from modifying this
            # room until we commit, preventing phantom reads on the player list.
            room = Room.objects.select_for_update().get(pk=room.pk)

            # Handle JSON parsing errors
            try:
                data = request.data.copy()
            except Exception:
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
            if is_spectator_join and spectator_count >= Room.MAX_SPECTATORS:
                return Response(
                    {"error": f"Spectator limit reached (max {Room.MAX_SPECTATORS})"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if is_spectator_join:
                # Spectators are auto-numbered "Spectator N". The number is
                # derived from a snapshot of existing names, so two concurrent
                # spectator joins (e.g. E2E workers=2) can pick the SAME N and
                # both hit the (room, name) unique constraint. Rather than
                # 409-ing a legitimate spectator, retry with the next free
                # number. Each attempt is wrapped in its own atomic block
                # (savepoint) so an IntegrityError aborts only that savepoint,
                # not the outer transaction (Postgres enters aborted state on error).
                spectator_num = 0
                MAX_SPECTATOR_ALLOC_RETRIES = Room.MAX_SPECTATORS + 1
                for _ in range(MAX_SPECTATOR_ALLOC_RETRIES):
                    try:
                        with transaction.atomic():
                            existing_names = set(
                                Player.objects.filter(room=room).values_list(
                                    "name", flat=True
                                )
                            )
                            spectator_num += 1
                            while f"Spectator {spectator_num}" in existing_names:
                                spectator_num += 1
                            data["name"] = f"Spectator {spectator_num}"
                            serializer = PlayerCreateSerializer(
                                data=data, context={"room": room}
                            )
                            if not serializer.is_valid():
                                return Response(
                                    serializer.errors,
                                    status=status.HTTP_400_BAD_REQUEST,
                                )
                            player = serializer.save()
                            break
                    except IntegrityError:
                        continue
                else:
                    return Response(
                        {
                            "error": f"Spectator limit reached (max {Room.MAX_SPECTATORS})",
                            "conflict_type": "spectator_limit",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                # Non-spectator join. Wrap in its own savepoint so an
                # IntegrityError on duplicate name returns 409 without aborting
                # the outer transaction.
                try:
                    with transaction.atomic():
                        existing_names = set(
                            Player.objects.filter(room=room).values_list(
                                "name", flat=True
                            )
                        )
                        serializer = PlayerCreateSerializer(
                            data=data, context={"room": room}
                        )
                        if not serializer.is_valid():
                            return Response(
                                serializer.errors,
                                status=status.HTTP_400_BAD_REQUEST,
                            )
                        player = serializer.save()
                except IntegrityError:
                    return Response(
                        {
                            "error": "Name is already taken in this room",
                            "conflict_type": "duplicate_name",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

            # Shared success path (both spectator and player joins).
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

            token_data = get_authenticated_player(player)

            response_data = PlayerCreateSerializer(player).data
            response_data.update(
                {
                    "access_token": token_data["access_token"],
                    "refresh_token": token_data["refresh_token"],
                }
            )

            return Response(
                response_data,
                status=status.HTTP_201_CREATED,
            )

    @action(detail=True, methods=["post"])
    def toggle_ready(self, request, pk=None, code=None):
        """
        Toggle a player's ready status in this room.
        """
        room = self.get_object()
        player, error = resolve_player_from_request(request, room)
        if error:
            return error

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
        player, error = resolve_player_from_request(request, room)
        if error:
            return error

        if not player.is_host:
            return Response(
                {"error": "Only host can start game"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if room.status != Room.Status.LOBBY:
            return Response(
                {"error": "Game has already started"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        players = room.players.filter(is_spectator=False)
        if len(players) < Room.MIN_PRODUCERS_TO_PLAY:
            return Response(
                {"error": "Need at least 2 players to start"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Change room status
            room.status = Room.Status.PLAYING

            # Determine match type based on current spectator count
            spectator_count = room.players.filter(is_spectator=True).count()
            room.match_type = Room.MatchType.RANKED if spectator_count >= Room.MIN_SPECTATORS_FOR_RANKED else Room.MatchType.CASUAL
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
            timer_ends = timer_started + timezone.timedelta(seconds=ROUND_SECONDS)

            first_round = Round.objects.create(
                room=room,
                round_number=1,
                current_tile_genre=first_genre,
                timer_duration=ROUND_SECONDS,
                timer_started_at=timer_started,
                timer_ends_at=timer_ends,
            )

        broadcast_game_update(room)
        broadcast_timer_tick(room)
        start_timer_broadcast(room.id, ROUND_SECONDS)

        return Response(
            {
                "status": "started",
                "round_number": 1,
                "genre": first_genre,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def reset_game(self, request, pk=None, code=None):
        """
        Reset the game in a room. Only host can reset.
        """
        room = self.get_object()
        player, error = resolve_player_from_request(request, room)
        if error:
            return error

        if not player.is_host:
            return Response(
                {"error": "Only host can reset game"},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            # Reset room status
            room.status = Room.Status.LOBBY
            room.save()

            # Delete all rounds and votes
            Round.objects.filter(room=room).delete()

            # Reset all players' ready status and tiles
            for p in room.players.all():
                p.is_ready = False
                p.save(update_fields=["is_ready"])
                Tile.objects.filter(player=p).delete()

        broadcast_game_update(room)

        return Response(
            {"status": "reset"},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"])
    def game_state(self, request, pk=None, code=None):
        """
        Get the current game state for a room.
        """
        room = self.get_object()
        serializer = GameStateSerializer(room)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"])
    def my_state(self, request, pk=None, code=None):
        """
        Get the current game state for a specific player.
        """
        room = self.get_object()
        player, error = resolve_player_from_request(request, room)
        if error:
            return error

        serializer = GameStateSerializer(room)
        data = serializer.data
        data["my_id"] = str(player.id)
        data["my_secret"] = "***"  # Never return the secret
        return Response(data, status=status.HTTP_200_OK)


class PlayerViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing players.
    """

    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    permission_classes = [AllowAny]
    lookup_field = "player_secret"  # Allow lookup by player secret
    # Security: disable generic create/write/delete routes. Players may only
    # be created through room create_room/join_game actions which enforce
    # lobby status and spectator-count limits. Privileged state changes go
    # through the custom actions (toggle_ready, etc.). See security finding
    # player_crud_open.
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return PlayerCreateSerializer
        return PlayerSerializer

    def get_object(self):
        """Override to look up by player_secret (hashed) from URL kwarg."""
        raw_secret = self.kwargs.get(self.lookup_field) or self.kwargs.get("pk")
        if not raw_secret:
            raise Http404

        # incoming secret is the stored (hashed) value; only hash if
        # it is not already a hex digest
        hashed = raw_secret if is_hex64(raw_secret) else hash_secret(raw_secret)
        try:
            return Player.objects.get(player_secret=hashed)
        except Player.DoesNotExist:
            raise Http404

    @action(detail=True, methods=["get"])
    def genre_performance(self, request, pk=None):
        """
        Get genre performance stats for a player with FIFA-style grades.
        """
        player = self.get_object()
        serializer = GenrePerformanceSerializer(build_genre_performance(player), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def leave_game(self, request, pk=None, code=None):
        """
        Leave a game room.
        """
        try:
            player = self.get_object()
        except (Player.DoesNotExist, Http404):
            # Already deleted by a concurrent cleanup.
            return Response({"status": "Already left"}, status=status.HTTP_200_OK)

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

    @action(detail=True, methods=["post"])
    def claim_bingo(self, request, pk=None, player_secret=None):
        """Idempotent bingo claim for a player in their room.

        A player may only claim bingo once per room. Duplicate claims from the
        same player are rejected (HTTP 409) rather than double-counted. The
        row-level uniqueness is enforced by BingoClaim.unique_together, so a
        concurrent double-submit race can never create two claims.
        """
        player = self.get_object()
        room = player.room
        if not room:
            return Response(
                {"error": "Player is not in a room"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Detail lookup is by `player_secret`, so self.get_object() has already
        # resolved the player by secret — but we still need to verify ownership.
        # The room check above confirms the player is in a valid room.

        # Check if the player has a completed bingo line
        player_tiles = list(player.tiles.filter(status=Tile.Status.COMPLETE))
        completed_lines = check_bingo_lines(player_tiles)
        if not completed_lines:
            return Response(
                {"error": "No bingo line completed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Idempotent claim
        claim, created = BingoClaim.objects.get_or_create(room=room, player=player)
        if not created:
            return Response(
                {"error": "Bingo already claimed", "conflict_type": "duplicate_claim"},
                status=status.HTTP_409_CONFLICT,
            )

        # Resolve the round/winner
        current_round = Round.objects.filter(room=room).order_by("-round_number").first()
        if current_round:
            _resolve_bingo_and_winner(room, player)

        return Response(
            {"status": "Bingo claimed"},
            status=status.HTTP_201_CREATED,
        )


# Need to import Http404 for the PlayerViewSet.get_object override
from django.http import Http404


class TileViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing game tiles.
    """

    queryset = Tile.objects.all()
    serializer_class = TileSerializer
    permission_classes = [AllowAny]
    throttle_scope = "audio_upload"
    # Security: disable generic write/delete routes. Tile state changes must
    # go through the play_tile action which enforces ownership, round genre,
    # and file validation. See security finding tile_crud_open.
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return TileSerializer
        return TileSerializer

    @action(detail=True, methods=["post"])
    def play_tile(self, request, pk=None):
        """
        Play a tile (submit audio). Enforces ownership, round genre, and file validation.
        """
        tile = self.get_object()
        player, error = resolve_player_from_request(request, tile.player.room)
        if error:
            return error

        if tile.player_id != player.id:
            return Response(
                {"error": "Not your tile"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Handle audio file upload
        audio_file = request.FILES.get("audio_file")
        if not audio_file:
            return Response(
                {"error": "No audio file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate file type
        if not audio_file.content_type.startswith("audio/"):
            return Response(
                {"error": "Invalid file type — audio required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Save the audio file
        tile.audio_file = audio_file
        tile.status = Tile.Status.COMPLETE
        tile.save()

        broadcast_game_update(tile.room)

        return Response(
            {"status": "Tile played", "tile_id": str(tile.id)},
            status=status.HTTP_200_OK,
        )


class VoteViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing votes.
    """

    queryset = Vote.objects.all()
    serializer_class = VoteSerializer
    permission_classes = [AllowAny]
    throttle_scope = "default"
    http_method_names = ["get", "post", "head", "options"]

    def perform_create(self, serializer):
        serializer.save(voter=self.request.user.player)


class RoundViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing rounds.
    """

    queryset = Round.objects.all()
    serializer_class = RoundSerializer
    permission_classes = [AllowAny]
    throttle_scope = "default"
    http_method_names = ["get", "head", "options"]


class ThemeRotationViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing theme rotations.
    """

    queryset = ThemeRotation.objects.all()
    serializer_class = ThemeRotationSerializer
    permission_classes = [AllowAny]
    throttle_scope = "default"
    http_method_names = ["get", "head", "options"]

from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db import transaction, IntegrityError
from django.db.models import Prefetch
from itertools import groupby
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import random

from .models import Room, Player, Tile
from .serializers import (
    RoomSerializer,
    RoomDetailSerializer,
    RoomCreateSerializer,
    TileSerializer,
    PlayerSerializer,
    PlayerCreateSerializer,
    GameStateSerializer,
)
from .bingo_utils import check_bingo_lines, calculate_bingo_score, check_tie_breaker


def broadcast_game_update(room):
    """
    Helper to broadcast game state updates to the room's channel group.
    """
    channel_layer = get_channel_layer()
    serializer = GameStateSerializer(room)
    async_to_sync(channel_layer.group_send)(
        f"game_{room.id}", {"type": "game_state_update", "payload": serializer.data}
    )


class RoomViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing game rooms.
    """

    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [AllowAny]
    lookup_field = "code"  # Allow lookup by 4-digit room code

    def get_object(self):
        if self.kwargs.get(self.lookup_field):
            # Try to get by room code first
            try:
                return Room.objects.get(code=self.kwargs[self.lookup_field])
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

    def perform_create(self, serializer):
        # When creating a room, set the creator as the first player
        room = serializer.save()

        # Generate unique 4-digit room code
        while True:
            code = "".join(random.choices("0123456789", k=4))
            if not Room.objects.filter(code=code).exists():
                room.code = code
                room.save()
                break

        player_name = serializer.validated_data.get("player_name", "Host")
        player = Player.objects.create(room=room, name=player_name, is_spectator=False)

        all_genres = list(Tile.Genre.values)
        random.shuffle(all_genres)
        genres = all_genres[:9]

        for position in range(9):
            Tile.objects.create(
                player=player, room=room, position=position, genre=genres.pop()
            )

    @action(detail=True, methods=["post"])
    def join_game(self, request, pk=None, code=None):
        """
        Join a game room as a player or spectator.
        """
        room = self.get_object()

        if room.status != Room.Status.LOBBY:
            return Response(
                {"error": "Cannot join a game that has already started"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Handle spectator naming with auto-increment
            data = request.data.copy()
            if data.get("is_spectator", False):
                existing_names = set(
                    Player.objects.filter(room=room).values_list("name", flat=True)
                )
                spectator_num = 1
                while f"Spectator {spectator_num}" in existing_names:
                    spectator_num += 1
                data["player_name"] = f"Spectator {spectator_num}"
            else:
                existing_names = set(
                    Player.objects.filter(room=room).values_list("name", flat=True)
                )

            serializer = PlayerCreateSerializer(data=data, context={"room": room})
            if serializer.is_valid():
                player = serializer.save()

                # Create tiles immediately for non-spectators
                if not player.is_spectator:
                    all_genres = list(Tile.Genre.values)
                    random.shuffle(all_genres)
                    genres = all_genres[:9]

                    for position in range(9):  # 3x3 grid, positions 0-8
                        tile = Tile.objects.create(
                            player=player,
                            position=position,
                            genre=genres.pop(),  # Random genre from shuffled list
                            room=room,
                        )

                # Broadcast update
                broadcast_game_update(room)

                # Return updated room state
                room_serializer = RoomDetailSerializer(room)
                return Response(room_serializer.data, status=status.HTTP_201_CREATED)

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
            return Response(
                {
                    "error": f"Failed to join room: {str(e)}",
                    "details": str(e),
                    "existing_names_in_room": list(existing_names)
                    if "existing_names" in locals()
                    else [],
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"])
    def start_game(self, request, pk=None):
        """
        Start the game in a room.
        """
        room = self.get_object()

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

            # Broadcast update
            broadcast_game_update(room)

        return Response({"status": "Game started"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"])
    def game_state(self, request, pk=None):
        """
        Get the current game state.
        """
        room = self.get_object()
        serializer = GameStateSerializer(room)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def rejoin_game(self, request, pk=None):
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
                    "playerSecret": str(player.player_secret),
                },
                status=status.HTTP_200_OK,
            )
        except Player.DoesNotExist:
            return Response(
                {"error": "Player not found with this secret"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=True, methods=["post"])
    def reset_game(self, request, pk=None):
        """
        Reset the game for a new round. Only host can reset.
        """
        room = self.get_object()
        requester_secret = request.data.get("player_secret")

        if not requester_secret:
            return Response(
                {"error": "player_secret is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            host = room.players.filter(is_spectator=False).first()
            if not host or str(host.player_secret) != requester_secret:
                return Response(
                    {"error": "Only host can reset game"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            with transaction.atomic():
                Tile.objects.filter(player__room=room).delete()
                room.status = Room.Status.LOBBY
                room.current_round += 1
                room.winner = None
                room.save()

                players = room.players.filter(is_spectator=False)
                for player in players:
                    all_genres = list(Tile.Genre.values)
                    random.shuffle(all_genres)
                    genres = all_genres[:9]

                    for position in range(9):
                        Tile.objects.create(
                            player=player, position=position, genre=genres.pop()
                        )

                broadcast_game_update(room)

            return Response(
                {"status": "Game reset", "round": room.current_round},
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"error": f"Failed to reset game: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"])
    def kick_player(self, request, pk=None):
        room = self.get_object()
        requester_secret = request.data.get("player_secret")
        target_player_id = request.data.get("player_id")

        if not requester_secret or not target_player_id:
            return Response(
                {"error": "player_secret and player_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            host = room.players.filter(is_spectator=False).first()
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
            return Response(
                {"error": f"Failed to kick player: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PlayerViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing players.
    """

    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    permission_classes = [AllowAny]

    def get_serializer_class(self):
        if self.action == "create":
            return PlayerCreateSerializer  # Use create serializer for direct player creation
        return PlayerSerializer

    def perform_create(self, serializer):
        """
        Override to ensure room is set when creating players directly.
        This handles the case where players are created via PlayerViewSet.create()
        """
        # Get room from request data or context
        room_id = serializer.validated_data.get("room_id") or self.request.data.get(
            "room_id"
        )
        if room_id:
            from .models import Room

            room = Room.objects.get(id=room_id)
            serializer.save(room=room)
        else:
            serializer.save()

    @action(detail=True, methods=["post"])
    def leave_game(self, request, pk=None):
        """
        Leave a game room.
        """
        player = self.get_object()
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

    @action(detail=True, methods=["post"])
    def play_tile(self, request, pk=None):
        """
        Play a tile in the game.
        """
        tile = self.get_object()
        room = tile.room

        if room.status != Room.Status.PLAYING:
            return Response(
                {"error": "Game is not in progress"}, status=status.HTTP_400_BAD_REQUEST
            )

        if tile.is_revealed:
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

        with transaction.atomic():
            # Update tile
            tile.status = Tile.Status.COMPLETE
            audio_file = request.FILES.get("audio_file")
            if audio_file:
                tile.audio_file = audio_file
            tile.save()

            # Check for bingo lines (proper bingo logic) - OPTIMIZED
            # Bulk fetch all completed tiles for room players with prefetch

            all_players_with_tiles = room.players.filter(
                is_spectator=False
            ).prefetch_related(
                Prefetch(
                    "tile_set",
                    queryset=Tile.objects.filter(status=Tile.Status.COMPLETE),
                    to_attr="completed_tiles",
                )
            )

            # Get current player's completed tiles from prefetched data
            current_player_tiles = next(
                (
                    p.completed_tiles
                    for p in all_players_with_tiles
                    if p.id == player.id
                ),
                [],
            )

            if len(current_player_tiles) >= 5:
                # Check if current player has completed any bingo lines
                player_tiles = list(current_player_tiles)
                completed_lines = check_bingo_lines(player_tiles)

                if completed_lines:
                    # Calculate score based on completed lines
                    score_info = calculate_bingo_score(player, completed_lines)

                    # Check for multiple winners in this round (NO N+1 queries)
                    player_scores = []

                    for other_player in all_players_with_tiles:
                        other_completed_tiles = other_player.completed_tiles

                        if other_completed_tiles:
                            other_tiles_list = list(other_completed_tiles)
                            other_completed_lines = check_bingo_lines(other_tiles_list)

                            if other_completed_lines:
                                other_score_info = calculate_bingo_score(
                                    other_player, other_completed_lines
                                )
                                player_scores.append((other_player, other_score_info))

                    # Check if this player is the sole winner or needs tie-breaking
                    if len(player_scores) == 0:
                        # Solo winner
                        room.status = Room.Status.FINISHED
                        room.winner = player
                        room.save()
                    else:
                        # Multiple players completed lines - apply tie-breaking
                        player_scores.append((player, score_info))
                        winner = check_tie_breaker(player_scores)

                        if winner:
                            room.status = Room.Status.FINISHED
                            room.winner = winner
                            room.save()

            # Broadcast update
            broadcast_game_update(room)

        # Return updated game state
        game_serializer = GameStateSerializer(room)
        return Response(game_serializer.data, status=status.HTTP_200_OK)

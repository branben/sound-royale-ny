from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db import transaction, IntegrityError
from django.utils import timezone
import random
import logging

from .models import Room, Player, Tile, Round, Vote, VerifiedUser, EloDeltaEvent
from .serializers import (
    RoomSerializer,
    RoomDetailSerializer,
    RoomCreateSerializer,
    PlayerSerializer,
    PlayerCreateSerializer,
    TileSerializer,
    GameStateSerializer,
    RoundSerializer,
    VoteSerializer,
)
from .helpers import _current_verified_user, _protected_display_name_owner
from .broadcasting import broadcast_game_update, broadcast_timer_tick, start_timer_broadcast
from .bingo_utils import check_bingo_lines, calculate_bingo_score, check_tie_breaker, get_theme_genres

logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("game_audit")


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
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # When creating a room, set the creator as the first player
        room = serializer.save()

        # Generate unique 4-digit room code
        while True:
            code = "".join(random.choices("0123456789", k=4))
            if not Room.objects.filter(code=code).exists():
                room.code = code
                room.save()
                break

        verified_user = _current_verified_user(request)
        player_name = verified_user.display_name if verified_user else serializer.validated_data.get("player_name", "Host")
        protected_owner = _protected_display_name_owner(player_name)
        if protected_owner and protected_owner != verified_user:
            return Response(
                {"error": "This display name belongs to a verified player"},
                status=status.HTTP_403_FORBIDDEN,
            )
        player = Player.objects.create(
            room=room,
            name=player_name,
            verified_user=verified_user,
            is_spectator=False,
            is_host=True,
        )

        # Use theme-based genre selection or default
        theme = serializer.validated_data.get("theme", "classic")
        custom_genres = serializer.validated_data.get("custom_genres", [])

        # Theme genre mapping
        theme_genres = {
            "classic": ["Phonk", "Trap", "Lo-Fi", "House", "Drill", "R&B", "EDM", "Jazz", "Ambient"],
            "phonk": ["Phonk", "Trap", "Drill", "House", "R&B"],
            "trap": ["Trap", "Phonk", "Drill", "R&B", "EDM"],
            "lofi": ["Lo-Fi", "Ambient", "Jazz", "R&B", "Phonk"],
            "house": ["House", "EDM", "Techno", "Disco", "Lo-Fi"],
            "electronic": ["EDM", "House", "Techno", "Trance", "Dubstep"],
            "custom": custom_genres if len(custom_genres) >= 9 else ["Phonk", "Trap", "Lo-Fi", "House", "Drill", "R&B", "EDM", "Jazz", "Ambient"],
        }

        selected_genres = theme_genres.get(theme, theme_genres["classic"])
        # Ensure we have exactly 9 genres
        if len(selected_genres) < 9:
            # Fill with default genres if needed
            default_genres = theme_genres["classic"]
            for genre in default_genres:
                if genre not in selected_genres:
                    selected_genres.append(genre)
                if len(selected_genres) >= 9:
                    break
        selected_genres = selected_genres[:9]

        random.shuffle(selected_genres)
        genres = selected_genres.copy()

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

        if room.status != Room.Status.LOBBY:
            return Response(
                {"error": "Cannot join a game that has already started"},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

                verified_user = _current_verified_user(request)
                spectator_count = room.players.filter(is_spectator=True).count()
                if data.get("is_spectator", False):
                    if spectator_count >= 10:
                        return Response(
                            {"error": "Spectator limit reached (max 10)"},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

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
                    protected_owner = _protected_display_name_owner(data.get("player_name"))
                    if protected_owner and protected_owner != verified_user:
                        return Response(
                            {"error": "This display name belongs to a verified player"},
                            status=status.HTTP_403_FORBIDDEN,
                        )
                    if verified_user:
                        data["player_name"] = verified_user.display_name

                serializer = PlayerCreateSerializer(data=data, context={"room": room})
                if serializer.is_valid():
                    player = serializer.save()
                    if not player.is_spectator and verified_user:
                        player.verified_user = verified_user
                    # Mark as connected since they just joined
                    player.is_connected = True
                    player.save()

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

                    broadcast_game_update(room)

                    room_serializer = RoomDetailSerializer(room)
                    return Response(
                        {
                            **room_serializer.data,
                            "player_id": str(player.id),
                            "player_secret": str(player.player_secret),
                        },
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
    def start_game(self, request, pk=None, code=None):
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

            # Create the first round with a random genre
            used_genres = set(
                Round.objects.filter(room=room).values_list(
                    "current_tile_genre", flat=True
                )
            )
            # Use theme-based genre selection
            theme_genres = get_theme_genres(room)
            used_genres = list(Round.objects.filter(room=room).values_list("current_tile_genre", flat=True))
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
            if not player.is_connected:
                player.is_connected = True
                player.save(update_fields=["is_connected"])
            return Response(
                {
                    "id": str(player.id),
                    "name": player.name,
                    "isSpectator": player.is_spectator,
                    "player_secret": player.player_secret,
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
                
                # Step 4: Create new tiles for all players using theme-based genre selection
                theme_genres = get_theme_genres(room)
                available_genres = theme_genres
                
                for player in players:
                    # Create a copy of genres for each player to ensure uniqueness
                    player_genres = available_genres.copy()
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
                
                # Step 6: Broadcast update (outside of database operations but within transaction)
                try:
                    broadcast_game_update(room)
                except Exception as e:
                    # Broadcast failure shouldn't rollback the database changes
                    # Log it but continue with success response
                    logger.warning(f"Failed to broadcast game update for room {room.code}: {str(e)}")

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

        # Guard: don't advance a finished game
        if room.status == Room.Status.FINISHED:
            return Response(
                {"error": "Game has already finished"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_round = Round.objects.filter(room=room).first()
        if not current_round:
            return Response(
                {"error": "No active round in this room"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        spectator_count = room.players.filter(is_spectator=True).count()
        is_ranked = spectator_count >= 3

        if is_ranked and current_round.voting_open:
            if current_round.votes_recorded < spectator_count:
                return Response(
                    {"error": "Waiting for all spectators to vote"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            votes_for = {}
            for vote in current_round.votes.select_related("voted_for").all():
                voted_for_id = str(vote.voted_for.id)
                votes_for[voted_for_id] = votes_for.get(voted_for_id, 0) + 1

            if not votes_for:
                return Response(
                    {"error": "No votes recorded"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            max_votes = max(votes_for.values())
            winners = [pid for pid, count in votes_for.items() if count == max_votes]

            if len(winners) > 1:
                current_round.voting_open = True
                current_round.votes_recorded = 0
                Vote.objects.filter(round=current_round).delete()
                current_round.save()
                broadcast_game_update(room)
                return Response(
                    {"error": "Tie vote - re-voting required", "tie": True},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            winner_id = winners[0]
            winner = Player.objects.get(id=winner_id)

            current_round.winner = winner
            current_round.voting_open = False
            current_round.save()

            producer_count = room.players.filter(is_spectator=False).count()
            if producer_count >= 2:
                base_gain = 25
                vote_margin = max_votes - (spectator_count - max_votes)
                if vote_margin == 1:
                    multiplier = 1.5
                elif vote_margin == spectator_count:
                    multiplier = 2.0
                else:
                    multiplier = 1.0

                elo_gain = int(base_gain * multiplier)
                
                loser = (
                    room.players.filter(is_spectator=False)
                    .exclude(id=winner_id)
                    .first()
                )
                
                with transaction.atomic():
                    # Lock verified user rows for update to prevent race conditions
                    verified_winner = VerifiedUser.objects.select_for_update().filter(id=winner.verified_user_id).first() if winner.verified_user_id else None
                    verified_loser = VerifiedUser.objects.select_for_update().filter(id=loser.verified_user_id).first() if loser and loser.verified_user_id else None
                    
                    # Create EloDeltaEvent for winner
                    if verified_winner:
                        EloDeltaEvent.objects.create(
                            verified_user=verified_winner,
                            room=room,
                            previous_elo=verified_winner.elo_rating,
                            delta=elo_gain,
                            new_elo=verified_winner.elo_rating + elo_gain,
                            match_result='win',
                            reason='round_win',
                            idempotency_key=request.data.get('idempotency_key')
                        )
                        # Incremental cache update (performance-optimized)
                        verified_winner.elo_rating += elo_gain
                        verified_winner.elo_wins += 1
                        verified_winner.elo_matches += 1
                        verified_winner.save()
                    
                    if loser:
                        # Create EloDeltaEvent for loser
                        if verified_loser:
                            EloDeltaEvent.objects.create(
                                verified_user=verified_loser,
                                room=room,
                                previous_elo=verified_loser.elo_rating,
                                delta=-elo_gain,
                                new_elo=max(100, verified_loser.elo_rating - elo_gain),
                                match_result='loss',
                                reason='round_loss',
                                idempotency_key=request.data.get('idempotency_key')
                            )
                            # Incremental cache update
                            verified_loser.elo_rating = max(100, verified_loser.elo_rating - elo_gain)
                            verified_loser.elo_losses += 1
                            verified_loser.elo_matches += 1
                            verified_loser.save()

                audit_logger.info(
                    "elo_updated",
                    extra={
                        "room_code": room.code,
                        "round_number": current_round.round_number,
                        "winner_id": str(winner.id),
                        "winner_name": winner.name,
                        "winner_new_rating": verified_winner.elo_rating if verified_winner else None,
                        "elo_gained": elo_gain,
                        "loser_id": str(loser.id) if loser else None,
                        "loser_name": loser.name if loser else None,
                        "loser_new_rating": verified_loser.elo_rating if verified_loser else None,
                        "timestamp": timezone.now().isoformat(),
                        "action": "elo_update",
                        "outcome": "success",
                    },
                )

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

        next_round_number = room.current_round + 1
        
        # Check if game should end based on total_rounds (only enforce if explicitly set to meaningful value)
        if room.total_rounds and room.total_rounds > 5 and next_round_number > room.total_rounds:
            room.status = Room.Status.FINISHED
            room.save(update_fields=["status"])
            broadcast_game_update(room)
            return Response(
                {
                    "status": "Game finished",
                    "reason": "All rounds completed",
                    "final_round": room.current_round,
                    "total_rounds": room.total_rounds,
                },
                status=status.HTTP_200_OK,
            )

        next_genre = random.choice(available_genres)

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
            room.save(update_fields=["current_round"])

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
    def toggle_ready(self, request, pk=None, code=None):
        """
        Toggle a player's ready state in the lobby.
        Requires player_secret for authentication.
        """
        room = self.get_object()
        player_secret = request.data.get("player_secret")

        if not player_secret:
            return Response(
                {"error": "player_secret is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if room.status != Room.Status.LOBBY:
            return Response(
                {"error": "Can only toggle ready in lobby"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            player = Player.objects.get(room=room, player_secret=player_secret)
        except Player.DoesNotExist:
            return Response(
                {"error": "Player not found with this secret"},
                status=status.HTTP_404_NOT_FOUND,
            )

        player.is_ready = not player.is_ready
        player.save()

        broadcast_game_update(room)

        return Response(
            {
                "status": "Ready state toggled",
                "is_ready": player.is_ready,
                "player": player.name,
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
        votes_for = {}
        for vote in current_round.votes.select_related("voted_for").all():
            voted_for_id = str(vote.voted_for.id)
            votes_for[voted_for_id] = votes_for.get(voted_for_id, 0) + 1

        if not votes_for:
            return Response(
                {"error": "No votes recorded"}, status=status.HTTP_400_BAD_REQUEST
            )

        max_votes = max(votes_for.values())
        winners = [pid for pid, count in votes_for.items() if count == max_votes]

        if len(winners) > 1:
            current_round.voting_open = True
            current_round.votes_recorded = 0
            Vote.objects.filter(round=current_round).delete()
            current_round.save()
            broadcast_game_update(room)
            return Response(
                {"error": "Tie vote - re-voting required", "tie": True},
                status=status.HTTP_400_BAD_REQUEST,
            )

        winner_id = winners[0]
        winner = Player.objects.get(id=winner_id)

        current_round.winner = winner
        current_round.voting_open = False
        current_round.save()

        producer_count = room.players.filter(is_spectator=False).count()
        if producer_count >= 2:
            base_gain = 25
            vote_margin = max_votes - (spectator_count - max_votes)
            if vote_margin == 1:
                multiplier = 1.5
            elif vote_margin == spectator_count:
                multiplier = 2.0
            else:
                multiplier = 1.0

            elo_gain = int(base_gain * multiplier)
            
            loser = (
                room.players.filter(is_spectator=False).exclude(id=winner_id).first()
            )
            
            with transaction.atomic():
                # Lock verified user rows for update to prevent race conditions
                verified_winner = VerifiedUser.objects.select_for_update().filter(id=winner.verified_user_id).first() if winner.verified_user_id else None
                verified_loser = VerifiedUser.objects.select_for_update().filter(id=loser.verified_user_id).first() if loser and loser.verified_user_id else None
                
                # Create EloDeltaEvent for winner
                if verified_winner:
                    EloDeltaEvent.objects.create(
                        verified_user=verified_winner,
                        room=room,
                        previous_elo=verified_winner.elo_rating,
                        delta=elo_gain,
                        new_elo=verified_winner.elo_rating + elo_gain,
                        match_result='win',
                        reason='round_win',
                        idempotency_key=self.request.data.get('idempotency_key')
                    )
                    # Incremental cache update
                    verified_winner.elo_rating += elo_gain
                    verified_winner.elo_wins += 1
                    verified_winner.elo_matches += 1
                    verified_winner.save()

                if loser:
                    # Create EloDeltaEvent for loser
                    if verified_loser:
                        EloDeltaEvent.objects.create(
                            verified_user=verified_loser,
                            room=room,
                            previous_elo=verified_loser.elo_rating,
                            delta=-elo_gain,
                            new_elo=max(100, verified_loser.elo_rating - elo_gain),
                            match_result='loss',
                            reason='round_loss',
                            idempotency_key=self.request.data.get('idempotency_key')
                        )
                        # Incremental cache update
                        verified_loser.elo_rating = max(100, verified_loser.elo_rating - elo_gain)
                        verified_loser.elo_losses += 1
                        verified_loser.elo_matches += 1
                        verified_loser.save()

        used_genres = set(
            Round.objects.filter(room=room).values_list("current_tile_genre", flat=True)
        )
        # Use theme-based genre selection
        theme_genres = get_theme_genres(room)
        available_genres = [g for g in theme_genres if g not in used_genres]
        if not available_genres:
            available_genres = theme_genres

        next_round_number = room.current_round + 1
        
        # Check if game should end based on total_rounds (only enforce if explicitly set to meaningful value)
        if room.total_rounds and room.total_rounds > 5 and next_round_number > room.total_rounds:
            room.status = Room.Status.FINISHED
            room.save(update_fields=["status"])
            broadcast_game_update(room)
            return Response(
                {
                    "status": "Game finished",
                    "reason": "All rounds completed",
                    "final_round": room.current_round,
                    "total_rounds": room.total_rounds,
                },
                status=status.HTTP_200_OK,
            )

        next_genre = random.choice(available_genres)

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
                "winner": winner.name,
                "elo_gained": elo_gain if producer_count >= 2 else 0,
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

    @action(detail=True, methods=["post"])
    def leave_game(self, request, pk=None, code=None):
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

        if tile.status == Tile.Status.COMPLETE:
            return Response(
                {"error": "Tile has already been played"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player_secret = request.data.get("player_secret")
        if not player_secret:
            return Response(
                {"error": "player_secret required"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            player = Player.objects.get(player_secret=player_secret, room=room, is_spectator=False)
        except Player.DoesNotExist:
            return Response(
                {"error": "Invalid player_secret"}, status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            # Update tile
            tile.status = Tile.Status.COMPLETE
            audio_file = request.FILES.get("audio_file")
            if audio_file:
                tile.audio_file = audio_file
            tile.save()

            # Check for bingo lines - direct query avoids prefetch cache
            # missing uncommitted saves inside transaction.atomic()
            current_player_tiles = list(
                Tile.objects.filter(player=player, status=Tile.Status.COMPLETE)
            )

            if len(current_player_tiles) >= 3:
                # Check if current player has completed any bingo lines
                player_tiles = list(current_player_tiles)
                completed_lines = check_bingo_lines(player_tiles)

                if completed_lines:
                    # Calculate score based on completed lines
                    score_info = calculate_bingo_score(player, completed_lines, room)

                    # Check for multiple winners in this round
                    player_scores = []
                    other_players = room.players.filter(
                        is_spectator=False
                    ).exclude(id=player.id)

                    for other_player in other_players:
                        other_tiles = list(Tile.objects.filter(
                            player=other_player, status=Tile.Status.COMPLETE
                        ))
                        if len(other_tiles) >= 3:
                            other_completed_lines = check_bingo_lines(other_tiles)
                            if other_completed_lines:
                                other_score_info = calculate_bingo_score(
                                    other_player, other_completed_lines, room
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

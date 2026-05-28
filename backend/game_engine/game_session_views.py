"""
Advanced GameSessionViewSet with multiple lookup field support
This demonstrates sophisticated ViewSet patterns for Django REST Framework
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
import logging
import uuid

from .models import Room, Player, Tile, Round
from .serializers import RoomSerializer, PlayerSerializer, TileSerializer

logger = logging.getLogger(__name__)


class GameSessionViewSet(viewsets.ModelViewSet):
    """
    Advanced ViewSet supporting multiple lookup fields:
    - room_code: Lookup by room code (e.g., /api/game-sessions/1234/)
    - room_uuid: Lookup by room UUID (e.g., /api/game-sessions/by-uuid/<uuid>/)
    - player_secret: Lookup by player secret (e.g., /api/game-sessions/by-player/<secret>/)
    
    Demonstrates advanced DRF patterns including:
    - Multiple lookup field support
    - Custom get_object() logic
    - Dynamic serializer selection
    - Custom action methods with different lookup strategies
    - Comprehensive error handling
    """
    
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [AllowAny]
    
    # Default lookup field for standard detail routes
    lookup_field = "code"
    
    def get_serializer_class(self):
        """Dynamic serializer selection based on action and context"""
        if self.action == 'players':
            return PlayerSerializer
        elif self.action == 'tiles':
            return TileSerializer
        elif self.action == 'session_stats':
            return RoomSerializer
        return super().get_serializer_class()
    
    def get_object(self):
        """
        Override get_object to handle multiple lookup field strategies
        based on the URL pattern and kwargs
        """
        # Check for different lookup field patterns in kwargs
        if 'room_code' in self.kwargs:
            # Lookup by room code (standard pattern)
            return get_object_or_404(Room, code=self.kwargs['room_code'])
        
        elif 'room_uuid' in self.kwargs:
            # Lookup by room UUID (custom pattern)
            try:
                uuid.UUID(self.kwargs['room_uuid'])
            except ValueError:
                raise ValueError("Invalid UUID format")
            return get_object_or_404(Room, id=self.kwargs['room_uuid'])
        
        elif 'player_secret' in self.kwargs:
            # Lookup by player secret (returns player's room)
            try:
                uuid.UUID(self.kwargs['player_secret'])
            except ValueError:
                raise ValueError("Invalid player secret format")
            
            player = get_object_or_404(Player, player_secret=self.kwargs['player_secret'])
            if not player.room:
                raise ValueError("Player has not joined a room")
            return player.room
        
        elif self.lookup_field in self.kwargs:
            # Standard lookup field (code) - handle test scenarios without request
            if hasattr(self, 'request'):
                return super().get_object()
            else:
                # Test scenario - bypass permission check
                return get_object_or_404(Room, code=self.kwargs[self.lookup_field])
        
        else:
            raise ValueError("No valid lookup field provided")
    
    def get_queryset(self):
        """Customize queryset based on lookup strategy"""
        if 'player_secret' in self.kwargs:
            # When looking up by player secret, filter to that player's room
            try:
                player = Player.objects.get(player_secret=self.kwargs['player_secret'])
                if not player.room:
                    return Room.objects.none()
                return Room.objects.filter(id=player.room.id)
            except Player.DoesNotExist:
                return Room.objects.none()
        
        return super().get_queryset()
    
    @action(detail=True, methods=['get'], url_path='by-uuid/(?P<room_uuid>[^/.]+)')
    def by_uuid(self, request, room_uuid=None):
        """
        Alternative detail route using UUID lookup
        URL: /api/game-sessions/{code}/by-uuid/{room_uuid}/
        """
        from django.core.exceptions import ValidationError
        try:
            room = get_object_or_404(Room, id=room_uuid)
            serializer = self.get_serializer(room)
            return Response(serializer.data)
        except (ValueError, ValidationError) as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error retrieving room by UUID {room_uuid}: {str(e)}")
            return Response(
                {"error": "Failed to retrieve room"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='by-player/(?P<player_secret>[^/.]+)')
    def by_player(self, request, player_secret=None):
        """
        List route to get session by player secret
        URL: /api/game-sessions/by-player/{player_secret}/
        """
        try:
            player = get_object_or_404(Player, player_secret=player_secret)
            if not player.room:
                return Response(
                    {"error": "Player has not joined a room"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            room = player.room
            serializer = self.get_serializer(room)
            return Response({
                'room': serializer.data,
                'player_info': {
                    'id': str(player.id),
                    'name': player.name,
                    'is_host': player.is_host,
                    'is_spectator': player.is_spectator,
                    'is_connected': player.is_connected
                }
            })
        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error retrieving session by player secret [REDACTED]: {str(e)}")
            return Response(
                {"error": "Failed to retrieve session"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def players(self, request, **kwargs):
        """
        Get all players in the game session
        Supports all lookup field patterns
        """
        room = self.get_object()
        players = room.players.all()
        serializer = self.get_serializer(players, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def tiles(self, request, **kwargs):
        """
        Get all tiles in the game session
        Supports all lookup field patterns
        """
        room = self.get_object()
        tiles = Tile.objects.filter(room=room)
        serializer = self.get_serializer(tiles, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def session_stats(self, request, **kwargs):
        """
        Get comprehensive session statistics
        Supports all lookup field patterns
        """
        room = self.get_object()
        
        # Calculate statistics
        players = room.players.all()
        tiles = Tile.objects.filter(room=room)
        rounds = Round.objects.filter(room=room)
        
        stats = {
            'room_info': {
                'code': room.code,
                'name': room.name,
                'status': room.status,
                'current_round': room.current_round,
                'created_at': room.created_at,
                'updated_at': room.updated_at
            },
            'player_stats': {
                'total_players': players.count(),
                'active_players': players.filter(is_spectator=False).count(),
                'spectators': players.filter(is_spectator=True).count(),
                'connected_players': players.filter(is_connected=True).count(),
                'host_name': room.host.name if room.host else None
            },
            'tile_stats': {
                'total_tiles': tiles.count(),
                'tiles_by_status': {
                    'empty': tiles.filter(status=Tile.Status.EMPTY).count(),
                    'pending': tiles.filter(status=Tile.Status.PENDING).count(),
                    'complete': tiles.filter(status=Tile.Status.COMPLETE).count()
                },
                'tiles_by_genre': {}
            },
            'round_stats': {
                'total_rounds': rounds.count(),
                'current_round_info': None
            }
        }
        
        # Calculate genre distribution
        genre_counts = {}
        for tile in tiles:
            genre = tile.genre
            genre_counts[genre] = genre_counts.get(genre, 0) + 1
        stats['tile_stats']['tiles_by_genre'] = genre_counts
        
        # Get current round info
        current_round = rounds.filter(round_number=room.current_round).first()
        if current_round:
            stats['round_stats']['current_round_info'] = {
                'round_number': current_round.round_number,
                'current_tile_genre': current_round.current_tile_genre,
                'voting_open': current_round.voting_open,
                'votes_recorded': current_round.votes_recorded,
                'timer_duration': current_round.timer_duration,
                'winner_name': current_round.winner.name if current_round.winner else None
            }
        
        return Response(stats)
    
    @action(detail=True, methods=['post'])
    def join_as_spectator(self, request, **kwargs):
        """
        Join a game session as spectator
        Supports all lookup field patterns
        """
        room = self.get_object()
        player_name = request.data.get('player_name')
        
        if not player_name:
            return Response(
                {"error": "player_name is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                # Check for name conflict
                if Player.objects.filter(room=room, name=player_name).exists():
                    return Response(
                        {"error": "Player name already taken in this room"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Create spectator player
                spectator = Player.objects.create(
                    room=room,
                    name=player_name,
                    is_spectator=True,
                    is_host=False,
                    player_secret=uuid.uuid4()
                )
                
                return Response({
                    'status': 'Joined as spectator',
                    'player_secret': str(spectator.player_secret),
                    'room_code': room.code,
                    'player_name': spectator.name
                }, status=status.HTTP_201_CREATED)
                
        except IntegrityError as e:
            logger.error(f"Database error creating spectator: {str(e)}")
            return Response(
                {"error": "Failed to join as spectator"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def quick_status_check(self, request, **kwargs):
        """
        Quick status check for game session
        Lightweight endpoint for polling
        """
        room = self.get_object()
        
        return Response({
            'code': room.code,
            'status': room.status,
            'current_round': room.current_round,
            'player_count': room.players.filter(is_spectator=False).count(),
            'spectator_count': room.players.filter(is_spectator=True).count(),
            'has_winner': room.winner is not None,
            'last_updated': room.updated_at.isoformat()
        })
    
    @action(detail=False, methods=['get'])
    def active_sessions(self, request):
        """
        List all active game sessions
        """
        active_rooms = Room.objects.exclude(status=Room.Status.FINISHED)
        serializer = self.get_serializer(active_rooms, many=True)
        return Response({
            'active_sessions': serializer.data,
            'count': active_rooms.count()
        })
    
    @action(detail=True, methods=['post'])
    def force_cleanup(self, request, **kwargs):
        """
        Force cleanup of a game session (admin/debug endpoint)
        WARNING: This will delete all game data for the session
        """
        room = self.get_object()
        
        # Verify admin status (simplified - in production, use proper authentication)
        admin_secret = request.data.get('admin_secret')
        if admin_secret != 'DEBUG_ADMIN_SECRET':
            return Response(
                {"error": "Admin authentication required"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            with transaction.atomic():
                # Delete all related data
                deleted_tiles = Tile.objects.filter(room=room).delete()[0]
                deleted_rounds = Round.objects.filter(room=room).delete()[0]
                deleted_players = room.players.all().delete()[0]
                
                # Reset room
                room.status = Room.Status.LOBBY
                room.current_round = 1
                room.winner = None
                room.save()
                
                return Response({
                    'status': 'Session cleaned up successfully',
                    'deleted_tiles': deleted_tiles,
                    'deleted_rounds': deleted_rounds,
                    'deleted_players': deleted_players,
                    'room_code': room.code
                })
                
        except Exception as e:
            logger.error(f"Error during session cleanup: {str(e)}")
            return Response(
                {"error": "Failed to cleanup session"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

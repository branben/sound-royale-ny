"""
Comprehensive tests for GameSessionViewSet multiple lookup field support
"""

import pytest
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.db import transaction, IntegrityError
from unittest.mock import patch, MagicMock
import uuid

from .models import Room, Player, Tile, Round
from .game_session_views import GameSessionViewSet
from .serializers import RoomSerializer, PlayerSerializer, TileSerializer
from game_engine.test_auth_helper import make_player


pytestmark = [pytest.mark.integration, pytest.mark.routing]


class GameSessionViewSetTestCase(APITestCase):
    """Test GameSessionViewSet with multiple lookup field support"""
    
    def setUp(self):
        """Set up test data"""
        self.room = Room.objects.create(code="1234", name="Test Room")
        self.host = make_player(
            room=self.room,
            name="HostPlayer",
            is_host=True,
            player_secret=uuid.uuid4()
        )
        self.player = make_player(
            room=self.room,
            name="TestPlayer",
            is_host=False,
            player_secret=uuid.uuid4()
        )
        self.spectator = make_player(
            room=self.room,
            name="SpectatorPlayer",
            is_spectator=True,
            player_secret=uuid.uuid4()
        )
        
        # Create some test tiles
        for i in range(3):
            Tile.objects.create(
                player=self.player,
                room=self.room,
                position=i,
                genre=Tile.Genre.PHONK
            )
        
        # Create a test round
        Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK
        )
    
    def test_lookup_by_room_code(self):
        """Test standard lookup by room code"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        room = viewset.get_object()
        self.assertEqual(room.code, self.room.code)
        self.assertEqual(room.id, self.room.id)
    
    def test_lookup_by_room_uuid(self):
        """Test lookup by room UUID"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'room_uuid': str(self.room.id)}
        viewset.format_kwarg = None
        
        room = viewset.get_object()
        self.assertEqual(room.id, self.room.id)
        self.assertEqual(room.code, self.room.code)
    
    def test_lookup_by_player_secret(self):
        """Test lookup by player secret"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'player_secret': self.player.plain_secret}
        viewset.format_kwarg = None
        
        room = viewset.get_object()
        self.assertEqual(room.id, self.player.room.id)
        self.assertEqual(room.code, self.room.code)
    
    def test_lookup_by_invalid_uuid(self):
        """Test lookup by invalid UUID format"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'room_uuid': 'invalid-uuid'}
        viewset.format_kwarg = None
        
        with self.assertRaises(ValueError) as cm:
            viewset.get_object()
        
        self.assertIn("Invalid UUID format", str(cm.exception))
    
    def test_lookup_by_invalid_player_secret(self):
        """Test lookup by invalid player secret format"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'player_secret': 'invalid-secret'}
        viewset.format_kwarg = None
        
        with self.assertRaises(ValueError) as cm:
            viewset.get_object()
        
        self.assertIn("Invalid player secret format", str(cm.exception))
    
    def test_lookup_by_nonexistent_room_code(self):
        """Test lookup by nonexistent room code"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'code': '9999'}
        viewset.format_kwarg = None
        
        with self.assertRaises(Exception):  # Should raise 404
            viewset.get_object()
    
    def test_lookup_by_nonexistent_player_secret(self):
        """Test lookup by nonexistent player secret"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'player_secret': str(uuid.uuid4())}
        viewset.format_kwarg = None
        
        with self.assertRaises(Exception):  # Should raise 404
            viewset.get_object()
    
    def test_dynamic_serializer_selection(self):
        """Test dynamic serializer selection based on action"""
        viewset = GameSessionViewSet()
        
        # Test default serializer
        viewset.action = None
        self.assertEqual(viewset.get_serializer_class(), RoomSerializer)
        
        # Test players action
        viewset.action = 'players'
        self.assertEqual(viewset.get_serializer_class(), PlayerSerializer)
        
        # Test tiles action
        viewset.action = 'tiles'
        self.assertEqual(viewset.get_serializer_class(), TileSerializer)
        
        # Test session_stats action
        viewset.action = 'session_stats'
        self.assertEqual(viewset.get_serializer_class(), RoomSerializer)
    
    def test_custom_queryset_for_player_secret_lookup(self):
        """Test custom queryset filtering for player secret lookup"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'player_secret': self.player.plain_secret}
        
        queryset = viewset.get_queryset()
        self.assertEqual(queryset.count(), 1)
        self.assertEqual(queryset.first().id, self.room.id)
    
    def test_players_action(self):
        """Test players action with multiple lookup patterns"""
        # Test with room code lookup
        viewset = GameSessionViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.action = 'players'
        viewset.format_kwarg = None
        viewset.request = MagicMock()  # Add mock request for serializer context
        
        request = MagicMock()
        response = viewset.players(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)  # host + player + spectator
    
    def test_tiles_action(self):
        """Test tiles action with multiple lookup patterns"""
        # Test with player secret lookup
        viewset = GameSessionViewSet()
        viewset.kwargs = {'player_secret': self.player.plain_secret}
        viewset.action = 'tiles'
        viewset.format_kwarg = None
        viewset.request = MagicMock()  # Add mock request for serializer context
        
        request = MagicMock()
        response = viewset.tiles(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)  # 3 tiles created in setUp
    
    def test_session_stats_action(self):
        """Test session stats action with comprehensive statistics"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'room_uuid': str(self.room.id)}
        viewset.action = 'session_stats'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        response = viewset.session_stats(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify response structure
        stats = response.data
        self.assertIn('room_info', stats)
        self.assertIn('player_stats', stats)
        self.assertIn('tile_stats', stats)
        self.assertIn('round_stats', stats)
        
        # Verify specific stats
        self.assertEqual(stats['player_stats']['total_players'], 3)
        self.assertEqual(stats['player_stats']['active_players'], 2)
        self.assertEqual(stats['player_stats']['spectators'], 1)
        self.assertEqual(stats['tile_stats']['total_tiles'], 3)
        self.assertEqual(stats['round_stats']['total_rounds'], 1)
    
    def test_join_as_spectator_action(self):
        """Test join as spectator action"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.action = 'join_as_spectator'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        request.data = {'player_name': 'NewSpectator'}
        
        response = viewset.join_as_spectator(request)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('player_secret', response.data)
        self.assertEqual(response.data['player_name'], 'NewSpectator')
        
        # Verify spectator was created
        self.assertTrue(Player.objects.filter(
            room=self.room, 
            name='NewSpectator', 
            is_spectator=True
        ).exists())
    
    def test_join_as_spectator_name_conflict(self):
        """Test join as spectator with name conflict"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.action = 'join_as_spectator'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        request.data = {'player_name': 'TestPlayer'}  # Already exists
        
        response = viewset.join_as_spectator(request)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name already taken', response.data['error'])
    
    def test_join_as_spectator_missing_name(self):
        """Test join as spectator without player name"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.action = 'join_as_spectator'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        request.data = {}  # Missing player_name
        
        response = viewset.join_as_spectator(request)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('player_name is required', response.data['error'])
    
    def test_quick_status_check_action(self):
        """Test quick status check action"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'player_secret': self.player.plain_secret}
        viewset.action = 'quick_status_check'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        response = viewset.quick_status_check(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify response structure
        status_data = response.data
        self.assertIn('code', status_data)
        self.assertIn('status', status_data)
        self.assertIn('current_round', status_data)
        self.assertIn('player_count', status_data)
        self.assertIn('spectator_count', status_data)
        self.assertIn('has_winner', status_data)
        self.assertIn('last_updated', status_data)
        
        # Verify specific values
        self.assertEqual(status_data['code'], self.room.code)
        self.assertEqual(status_data['player_count'], 2)
        self.assertEqual(status_data['spectator_count'], 1)
    
    def test_active_sessions_action(self):
        """Test active sessions list action"""
        # Create another room that's finished
        finished_room = Room.objects.create(code="9999", name="Finished Room")
        finished_room.status = Room.Status.FINISHED
        finished_room.save()
        
        viewset = GameSessionViewSet()
        viewset.action = 'active_sessions'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        response = viewset.active_sessions(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('active_sessions', response.data)
        self.assertIn('count', response.data)
        
        # Should only include active rooms (not finished)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['active_sessions']), 1)
        self.assertEqual(response.data['active_sessions'][0]['code'], self.room.code)
    
    @patch.dict('os.environ', {'ADMIN_SECRET': 'DEBUG_ADMIN_SECRET'})
    def test_force_cleanup_action_success(self):
        """Test force cleanup action with proper admin authentication"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.action = 'force_cleanup'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        request.data = {'admin_secret': 'DEBUG_ADMIN_SECRET'}
        
        initial_tile_count = Tile.objects.filter(room=self.room).count()
        initial_player_count = Player.objects.filter(room=self.room).count()
        initial_round_count = Round.objects.filter(room=self.room).count()
        
        response = viewset.force_cleanup(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Session cleaned up successfully', response.data['status'])
        
        # Verify cleanup
        self.assertEqual(response.data['deleted_tiles'], initial_tile_count)
        self.assertEqual(response.data['deleted_players'], initial_player_count)
        self.assertEqual(response.data['deleted_rounds'], initial_round_count)
        
        # Verify room was reset
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.LOBBY)
        self.assertEqual(self.room.current_round, 1)
        self.assertIsNone(self.room.winner)
    
    def test_force_cleanup_action_unauthorized(self):
        """Test force cleanup action without proper authentication"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.action = 'force_cleanup'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        request.data = {'admin_secret': 'WRONG_SECRET'}
        
        response = viewset.force_cleanup(request)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Admin authentication required', response.data['error'])
    
    def test_by_uuid_action(self):
        """Test by_uuid action with proper UUID validation"""
        viewset = GameSessionViewSet()
        viewset.kwargs = {'code': self.room.code}  # Base lookup
        viewset.action = 'by_uuid'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        
        # Test with valid UUID
        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.by_uuid(request, room_uuid=str(self.room.id))
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Test with invalid UUID
        response = viewset.by_uuid(request, room_uuid='invalid-uuid')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('not a valid UUID', str(response.data['error']))
    
    def test_by_player_action(self):
        """Test by_player action with comprehensive player info"""
        viewset = GameSessionViewSet()
        viewset.action = 'by_player'
        viewset.format_kwarg = None
        
        request = MagicMock()
        viewset.request = request
        
        # Mock get_object to return room
        with patch.object(viewset, 'get_object', return_value=self.room):
            # Mock Player.objects.get to return player
            with patch('game_engine.game_session_views.get_object_or_404') as mock_get:
                mock_get.return_value = self.player
                
                response = viewset.by_player(request, player_secret=self.player.plain_secret)
                
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertIn('room', response.data)
                self.assertIn('player_info', response.data)
                
                # Verify player info structure
                player_info = response.data['player_info']
                self.assertEqual(player_info['name'], self.player.name)
                self.assertEqual(player_info['is_host'], self.player.is_host)
                self.assertEqual(player_info['is_spectator'], self.player.is_spectator)
    
    def test_error_handling_in_all_lookup_methods(self):
        """Test comprehensive error handling across all lookup methods"""
        viewset = GameSessionViewSet()
        
        # Test missing lookup field
        viewset.kwargs = {}
        with self.assertRaises(ValueError) as cm:
            viewset.get_object()
        self.assertIn('No valid lookup field provided', str(cm.exception))
        
        # Test database errors in join_as_spectator
        viewset.kwargs = {'code': self.room.code}
        viewset.action = 'join_as_spectator'
        viewset.format_kwarg = None
        
        request = MagicMock()
        request.data = {'player_name': 'TestSpectator'}
        
        # Mock IntegrityError
        with patch('game_engine.game_session_views.Player.objects.create') as mock_create:
            mock_create.side_effect = IntegrityError("Database constraint error")
            
            response = viewset.join_as_spectator(request)
            self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
            self.assertIn('Failed to join as spectator', response.data['error'])


class GameSessionViewSetIntegrationTestCase(APITestCase):
    """Integration tests for GameSessionViewSet URL routing"""
    
    def setUp(self):
        """Set up test data"""
        self.room = Room.objects.create(code="5678", name="Integration Test Room")
        self.host = make_player(
            room=self.room,
            name="IntegrationHost",
            is_host=True,
            player_secret=uuid.uuid4()
        )
        self.player = make_player(
            room=self.room,
            name="IntegrationPlayer",
            is_host=False,
            player_secret=uuid.uuid4()
        )
    
    def test_url_patterns_work_with_different_lookups(self):
        """Test that URL patterns work with different lookup field patterns"""
        # This would be tested with actual URL routing in a full Django test
        # For now, we test the viewset logic directly
        
        viewset = GameSessionViewSet()
        
        # Test room code lookup
        viewset.kwargs = {'code': self.room.code}
        room = viewset.get_object()
        self.assertEqual(room.code, self.room.code)
        
        # Test UUID lookup
        viewset.kwargs = {'room_uuid': str(self.room.id)}
        room = viewset.get_object()
        self.assertEqual(room.id, self.room.id)
        
        # Test player secret lookup
        viewset.kwargs = {'player_secret': self.player.plain_secret}
        room = viewset.get_object()
        self.assertEqual(room.id, self.player.room.id)
    
    def test_comprehensive_session_workflow(self):
        """Test complete workflow using different lookup methods"""
        viewset = GameSessionViewSet()
        viewset.request = MagicMock()  # Add mock request for serializer context
        viewset.format_kwarg = None  # Add format_kwarg for serializer context
        
        # 1. Get room by code
        viewset.kwargs = {'code': self.room.code}
        room = viewset.get_object()
        self.assertEqual(room.code, self.room.code)
        
        # 2. Get players
        viewset.action = 'players'
        request = MagicMock()
        response = viewset.players(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        
        # 3. Get session stats
        viewset.action = 'session_stats'
        response = viewset.session_stats(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('room_info', response.data)
        
        # 4. Join as spectator
        viewset.action = 'join_as_spectator'
        request.data = {'player_name': 'WorkflowSpectator'}
        response = viewset.join_as_spectator(request)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # 5. Verify spectator was added
        viewset.action = 'players'
        response = viewset.players(request)
        self.assertEqual(len(response.data), 3)  # 2 original + 1 spectator
        
        # 6. Quick status check
        viewset.action = 'quick_status_check'
        response = viewset.quick_status_check(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['spectator_count'], 1)

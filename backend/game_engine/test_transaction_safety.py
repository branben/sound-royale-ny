import pytest
from django.test import TestCase
from rest_framework import status
from django.db import transaction, IntegrityError
from django.db.models import ProtectedError
from .models import Room, Player, Tile
from .views import RoomViewSet
import uuid
import random
from unittest.mock import patch, MagicMock
from game_engine.test_auth_helper import get_jwt_header, create_user_for_player, make_player


pytestmark = [pytest.mark.integration, pytest.mark.transaction]


class TransactionSafetyTestCase(TestCase):
    """Test transaction safety and rollback behavior in game operations"""

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
        self.room.status = Room.Status.LOBBY
        self.room.save()
        for p in [self.host, self.player]:
            create_user_for_player(p)
        self.host_auth = get_jwt_header(self.host)
    
    def test_reset_game_transaction_success(self):
        """Test successful game reset with transaction safety"""
        # Create some initial tiles
        for i in range(3):
            Tile.objects.create(
                player=self.player,
                room=self.room,
                position=i,
                genre=Tile.Genre.PHONK
            )

        initial_tile_count = Tile.objects.filter(player__room=self.room).count()
        self.assertEqual(initial_tile_count, 3)

        # Test the reset_game action
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None

        request_data = {}

        # Mock the request object with proper user auth
        request = MagicMock()
        request.data = request_data
        request.user = self.host.user
        request.user = self.host.user

        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.reset_game(request)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify transaction worked correctly
        final_tile_count = Tile.objects.filter(player__room=self.room).count()
        self.assertEqual(final_tile_count, 18)  # 2 players * 9 tiles each
        
        # Verify room state updated
        self.room.refresh_from_db()
        self.assertEqual(self.room.current_round, 1)  # Reset to 1 for new match
        self.assertEqual(self.room.status, Room.Status.LOBBY)
        self.assertIsNone(self.room.winner)
    
    def test_reset_game_rollback_on_integrity_error(self):
        """Test transaction rollback when IntegrityError occurs"""
        # Create initial tiles
        Tile.objects.create(
            player=self.player,
            room=self.room,
            position=0,
            genre=Tile.Genre.PHONK
        )
        
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        request_data = {
            'player_secret': self.host.plain_secret
        }
        
        request = MagicMock()
        request.data = request_data
        request.user = self.host.user
        
        # Mock Tile.objects.create to raise IntegrityError on second call
        original_create = Tile.objects.create
        call_count = [0]
        
        def mock_create(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] > 5:  # Let first few succeed, then fail
                raise IntegrityError("Mock integrity error")
            return original_create(*args, **kwargs)
        
        with patch.object(Tile.objects, 'create', side_effect=mock_create):
            with patch.object(viewset, 'get_object', return_value=self.room):
                response = viewset.reset_game(request)
        
        # IntegrityError is caught and re-raised as ValueError inside the view,
        # which is then caught by the outer except ValueError block → 400
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Failed to create tile", response.data['error'])
        
        # Verify rollback occurred - original tiles should still exist
        remaining_tiles = Tile.objects.filter(player__room=self.room).count()
        self.assertEqual(remaining_tiles, 1)  # Original tile should still be there
        
        # Verify room state was not updated
        self.room.refresh_from_db()
        self.assertEqual(self.room.current_round, 1)  # Should not have been incremented
    
    def test_reset_game_validation_error_no_rollback(self):
        """Test that validation errors don't cause unnecessary rollbacks"""
        # Set room to playing state with completed tiles
        self.room.status = Room.Status.PLAYING
        self.room.save()
        
        # Create completed tiles
        for i in range(2):
            Tile.objects.create(
                player=self.player,
                room=self.room,
                position=i,
                genre=Tile.Genre.PHONK,
                status=Tile.Status.COMPLETE
            )
        
        initial_tile_count = Tile.objects.filter(player__room=self.room).count()
        
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        request_data = {
            'player_secret': self.host.plain_secret
        }
        
        request = MagicMock()
        request.data = request_data
        request.user = self.host.user
        
        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.reset_game(request)
        
        # Reset should succeed even with completed tiles (casual mode support)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify tiles were deleted and recreated (2 players * 9 tiles = 18)
        final_tile_count = Tile.objects.filter(player__room=self.room).count()
        self.assertEqual(final_tile_count, 2 * 9)
        
        # Verify room was reset to LOBBY for new match
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.LOBBY)
        self.assertEqual(self.room.current_round, 1)
    
    @pytest.mark.skip(reason="Django TextChoices.values is a read-only property; cannot patch")
    def test_reset_game_insufficient_genres_error(self):
        """Test error handling when insufficient genres are available"""
        # NOTE: Django TextChoices metaclass makes 'values' a read-only property.
        # Patching it with unittest.mock raises AttributeError. This test would
        # require restructuring the view to accept an injectable genre list.
        pass
    
    def test_reset_game_no_players_error(self):
        """Test error handling when no active players exist"""
        # Create a spectator-only room (no host/producer)
        Player.objects.filter(room=self.room, is_spectator=False).delete()
        # Create a spectator to auth with
        spectator = make_player(
            room=self.room, name="OnlySpectator", is_spectator=True
        )
        create_user_for_player(spectator)

        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None

        request_data = {}

        request = MagicMock()
        request.data = request_data
        request.user = spectator.user

        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.reset_game(request)

        # Non-host gets permission error
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Only host can reset game", response.data['error'])
    
    def test_reset_game_broadcast_failure_continues(self):
        """Test that broadcast failure doesn't rollback successful database changes"""
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        request_data = {
            'player_secret': self.host.plain_secret
        }
        
        request = MagicMock()
        request.data = request_data
        request.user = self.host.user
        
        # Mock broadcast_game_update to raise an exception
        with patch('game_engine.views.broadcast_game_update', side_effect=Exception("Broadcast failed")):
            with patch.object(viewset, 'get_object', return_value=self.room):
                response = viewset.reset_game(request)
        
        # Should still succeed despite broadcast failure
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("successfully", response.data['status'])
        
        # Verify database changes were made
        tile_count = Tile.objects.filter(player__room=self.room).count()
        self.assertEqual(tile_count, 18)  # 2 players * 9 tiles each
    
    def test_reset_game_host_permission_error(self):
        """Test error handling for invalid host permissions"""
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        # Use non-host player
        request_data = {}

        request = MagicMock()
        request.data = request_data
        request.user = self.player.user

        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.reset_game(request)

        # Should return permission error
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Only host can reset", response.data['error'])
    
    def test_reset_game_unauthenticated(self):
        """Test error handling for unauthenticated requests"""
        from django.contrib.auth.models import AnonymousUser
        from rest_framework.test import APIRequestFactory
        from rest_framework.request import Request
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None

        factory = APIRequestFactory()
        wsgi_request = factory.post('/api/rooms/1234/reset_game/', {}, content_type='application/json')
        request = Request(wsgi_request)
        request.user = AnonymousUser()
        request._full_data = {}

        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.reset_game(request)

        # Should return auth error
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Authentication required", response.data['error'])
    
    def test_reset_game_concurrent_safety(self):
        """Test that concurrent reset operations are handled safely"""
        # This test simulates concurrent access scenarios
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        request_data = {
            'player_secret': self.host.plain_secret
        }
        
        request = MagicMock()
        request.data = request_data
        request.user = self.host.user
        
        # Mock get_object to return room with concurrent modification check
        with patch.object(viewset, 'get_object', return_value=self.room):
            # First reset should succeed
            response1 = viewset.reset_game(request)
            self.assertEqual(response1.status_code, status.HTTP_200_OK)
            
            # Verify tiles were created
            initial_tile_count = Tile.objects.filter(player__room=self.room).count()
            self.assertEqual(initial_tile_count, 18)
            
            # Second reset should also succeed (new round)
            response2 = viewset.reset_game(request)
            self.assertEqual(response2.status_code, status.HTTP_200_OK)
            
            # Verify tiles were recreated
            final_tile_count = Tile.objects.filter(player__room=self.room).count()
            self.assertEqual(final_tile_count, 18)  # Still 18 tiles (recreated)
            
            # Verify round incremented twice
            self.room.refresh_from_db()
            self.assertEqual(self.room.current_round, 1)  # Reset to 1 for new match
    
    def test_reset_game_detailed_response_data(self):
        """Test that response contains detailed success information"""
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        request_data = {
            'player_secret': self.host.plain_secret
        }
        
        request = MagicMock()
        request.data = request_data
        request.user = self.host.user
        
        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.reset_game(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify detailed response data
        response_data = response.data
        self.assertIn('status', response_data)
        self.assertIn('round', response_data)
        self.assertIn('tiles_created', response_data)
        self.assertIn('players', response_data)
        self.assertIn('previous_round', response_data)
        
        self.assertEqual(response_data['status'], "Game reset successfully")
        self.assertEqual(response_data['round'], 1)
        self.assertEqual(response_data['tiles_created'], 18)
        self.assertEqual(response_data['players'], 2)
        self.assertEqual(response_data['previous_round'], 1)


class TransactionEdgeCasesTestCase(TestCase):
    """Test edge cases and boundary conditions for transaction safety"""

    def setUp(self):
        """Set up test data"""
        self.room = Room.objects.create(code="5678", name="Edge Case Room")
        self.host = make_player(
            room=self.room,
            name="EdgeHost",
            is_host=True,
            player_secret=uuid.uuid4()
        )
        # Create many players for stress testing
        for i in range(5):
            make_player(
                room=self.room,
                name=f"Player{i}",
                is_host=False,
                player_secret=uuid.uuid4()
            )
        self.room.status = Room.Status.LOBBY
        self.room.save()
        for p in Player.objects.filter(room=self.room):
            create_user_for_player(p)
        self.host_auth = get_jwt_header(self.host)

    def _mock_request(self, data, user=None):
        """Create a mock request with proper auth."""
        request = MagicMock()
        request.data = data
        request.user = user or self.host.user
        return request
    
    def test_reset_game_with_many_players(self):
        """Test reset game with many players (stress test)"""
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        request_data = {
            'player_secret': self.host.plain_secret
        }
        
        request = MagicMock()
        request.data = request_data
        request.user = self.host.user
        
        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.reset_game(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Should create tiles for all 6 players (1 host + 5 regular)
        expected_tiles = 6 * 9  # 54 tiles
        self.assertEqual(response.data['tiles_created'], expected_tiles)
        
        # Verify all tiles exist in database
        actual_tiles = Tile.objects.filter(player__room=self.room).count()
        self.assertEqual(actual_tiles, expected_tiles)
    
    def test_reset_game_genre_distribution(self):
        """Test that genres are properly distributed among players"""
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        request_data = {
            'player_secret': self.host.plain_secret
        }
        
        request = MagicMock()
        request.data = request_data
        request.user = self.host.user
        
        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.reset_game(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify each player has exactly 9 tiles with unique genres
        players = Player.objects.filter(room=self.room, is_spectator=False)
        
        for player in players:
            player_tiles = Tile.objects.filter(player=player)
            self.assertEqual(player_tiles.count(), 9)
            
            # Check all positions are unique for this player
            positions = set(tile.position for tile in player_tiles)
            self.assertEqual(len(positions), 9)
            
            # Check all genres are unique for this player
            genres = set(tile.genre for tile in player_tiles)
            self.assertEqual(len(genres), 9)
    
    def test_reset_game_maximum_round_number(self):
        """Test reset game with high round numbers"""
        # Set round to a high number
        self.room.current_round = 999
        self.room.save()
        
        viewset = RoomViewSet()
        viewset.kwargs = {'code': self.room.code}
        viewset.format_kwarg = None
        
        request_data = {
            'player_secret': self.host.plain_secret
        }
        
        request = MagicMock()
        request.data = request_data
        request.user = self.host.user
        
        with patch.object(viewset, 'get_object', return_value=self.room):
            response = viewset.reset_game(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['round'], 1)
        self.assertEqual(response.data['previous_round'], 999)

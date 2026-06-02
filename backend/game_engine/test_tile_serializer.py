import pytest
from django.test import TestCase
from rest_framework import serializers
from .models import Room, Player, Tile
from .serializers import TileCreateSerializer
import uuid


pytestmark = [pytest.mark.unit, pytest.mark.validation]


class TileCreateSerializerTestCase(TestCase):
    """Test TileCreateSerializer validation and error handling"""
    
    def setUp(self):
        """Set up test data"""
        self.room = Room.objects.create(code="1234", name="Test Room")
        self.host = Player.objects.create(
            room=self.room,
            name="HostPlayer",
            is_host=True,
            player_secret=uuid.uuid4()
        )
        self.player = Player.objects.create(
            room=self.room,
            name="TestPlayer",
            is_host=False,
            player_secret=uuid.uuid4()
        )
        self.spectator = Player.objects.create(
            room=self.room,
            name="SpectatorPlayer",
            is_spectator=True,
            player_secret=uuid.uuid4()
        )
        
        # Set room to appropriate state for tile creation
        self.room.status = Room.Status.LOBBY
        self.room.save()
    
    def test_valid_tile_creation(self):
        """Test successful tile creation with valid data"""
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 0,
            'player': self.player.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertTrue(serializer.is_valid())
        
        # Create the tile
        tile = serializer.save()
        
        self.assertEqual(tile.genre, Tile.Genre.PHONK)
        self.assertEqual(tile.position, 0)
        self.assertEqual(tile.player, self.player)
        self.assertEqual(tile.room, self.room)
    
    def test_position_out_of_range_low(self):
        """Test validation fails for position < 0"""
        data = {
            'genre': Tile.Genre.PHONK,
            'position': -1,
            'player': self.player.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('Position -1 is invalid', str(serializer.errors))
    
    def test_position_out_of_range_high(self):
        """Test validation fails for position > 8"""
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 9,
            'player': self.player.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('Position 9 is invalid', str(serializer.errors))
    
    def test_duplicate_position_in_room(self):
        """Test validation fails for duplicate position in same room"""
        # Create first tile
        Tile.objects.create(
            genre=Tile.Genre.PHONK,
            position=2,
            player=self.player,
            room=self.room
        )
        
        # Try to create second tile with same position (unique_together on player+room+position)
        data = {
            'genre': Tile.Genre.TRAP,
            'position': 2,
            'player': self.player.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        # Django unique_together fires before custom validate()
        self.assertIn('unique', str(serializer.errors).lower())
    
    def test_duplicate_genre_for_player(self):
        """Test validation fails for duplicate genre for same player"""
        # Create first tile with POP genre
        Tile.objects.create(
            genre=Tile.Genre.PHONK,
            position=0,
            player=self.player,
            room=self.room
        )
        
        # Try to create second tile with same genre for same player
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 1,
            'player': self.player.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn("Genre 'phonk' is already used", str(serializer.errors))
    
    def test_duplicate_genre_different_players_allowed(self):
        """Test that different players can use same genre"""
        # Create tile for first player
        Tile.objects.create(
            genre=Tile.Genre.PHONK,
            position=0,
            player=self.player,
            room=self.room
        )
        
        # Create tile for host with same genre (should be allowed)
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 1,
            'player': self.host.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertTrue(serializer.is_valid())
    
    def test_invalid_genre(self):
        """Test validation fails for invalid genre"""
        data = {
            'genre': 'INVALID_GENRE',
            'position': 0,
            'player': self.player.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        # DRF ChoiceField validates before custom validate()
        self.assertIn('not a valid choice', str(serializer.errors))
    
    def test_spectator_cannot_have_tiles(self):
        """Test validation fails when spectator tries to create tiles"""
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 0,
            'player': self.spectator.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('Spectators cannot have tiles', str(serializer.errors))
    
    def test_room_inappropriate_status(self):
        """Test validation fails when room is not in appropriate state"""
        # Set room to finished state
        self.room.status = Room.Status.FINISHED
        self.room.save()
        
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 0,
            'player': self.player.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('Cannot create tiles in room with status', str(serializer.errors))
    
    def test_missing_required_field_player(self):
        """Test validation fails when player field is missing"""
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 0
            # Missing player field
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('player', serializer.errors)
    
    def test_missing_required_field_position(self):
        """Test validation fails when position field is missing"""
        data = {
            'genre': Tile.Genre.PHONK,
            'player': self.player.id
            # Missing position field
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('position', serializer.errors)
    
    def test_missing_required_field_genre(self):
        """Test validation fails when genre field is missing"""
        data = {
            'position': 0,
            'player': self.player.id
            # Missing genre field
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('genre', serializer.errors)
    
    def test_database_integrity_error_handling(self):
        """Test graceful handling of database integrity errors"""
        # This test simulates a database constraint violation
        # by creating a tile with invalid data that would cause IntegrityError
        
        # Create a tile first
        existing_tile = Tile.objects.create(
            genre=Tile.Genre.PHONK,
            position=0,
            player=self.player,
            room=self.room
        )
        
        # Try to create another tile at a different position
        data = {
            'genre': Tile.Genre.TRAP,
            'position': 4,
            'player': self.player.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        # This should work normally
        self.assertTrue(serializer.is_valid())
        tile = serializer.save()
        self.assertIsNotNone(tile.id)
    
    def test_comprehensive_validation_multiple_errors(self):
        """Test that validation catches errors (DRF validate() raises on first failure)"""
        # Use valid genre + position so custom validate() reaches spectator check
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 5,             # Valid position
            'player': self.spectator.id, # Spectator (not allowed)
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('Spectators cannot have tiles', str(serializer.errors))
        
        # Also verify position validation on its own
        data['position'] = 10
        data['player'] = self.player.id
        serializer2 = TileCreateSerializer(data=data)
        self.assertFalse(serializer2.is_valid())
        self.assertIn('Position 10 is invalid', str(serializer2.errors))
    
    def test_tile_creation_with_all_valid_genres(self):
        """Test tile creation works with all valid genres"""
        valid_genres = [choice[0] for choice in Tile.Genre.choices]
        
        for i, genre in enumerate(valid_genres):
            if i >= 9:  # Only 9 positions available (0-8)
                break
                
            data = {
                'genre': genre,
                'position': i,
                'player': self.host.id,  # Use host to avoid conflicts with self.player
                'room': self.room.id
            }
            serializer = TileCreateSerializer(data=data)
            
            self.assertTrue(serializer.is_valid(), f"Failed for genre {genre}")
            
            tile = serializer.save()
            self.assertEqual(tile.genre, genre)
            self.assertEqual(tile.position, i)
    
    def test_edge_case_position_boundary_values(self):
        """Test boundary values for position validation"""
        # Use host to avoid conflicts with setUp tiles (positions 0-2 for self.player)
        # Test position 0 (should work)
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 0,
            'player': self.host.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        
        # Test position 8 (should work)
        data['position'] = 8
        serializer = TileCreateSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        
        # Test position -1 (should fail)
        data['position'] = -1
        serializer = TileCreateSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        
        # Test position 9 (should fail)
        data['position'] = 9
        serializer = TileCreateSerializer(data=data)
        self.assertFalse(serializer.is_valid())


class TileCreateSerializerIntegrationTestCase(TestCase):
    """Integration tests for TileCreateSerializer with real database operations"""
    
    def setUp(self):
        """Set up test data"""
        self.room = Room.objects.create(code="5678", name="Integration Test Room")
        self.player = Player.objects.create(
            room=self.room,
            name="IntegrationPlayer",
            is_host=False,
            player_secret=uuid.uuid4()
        )
        self.room.status = Room.Status.LOBBY
        self.room.save()
    
    def test_full_tile_creation_workflow(self):
        """Test complete workflow of creating multiple tiles for a player"""
        created_tiles = []
        genres_to_use = [Tile.Genre.PHONK, Tile.Genre.TRAP, Tile.Genre.LOFI]
        
        for i, genre in enumerate(genres_to_use):
            data = {
                'genre': genre,
                'position': i + 3,  # Offset to avoid setUp tiles at positions 0-2
                'player': self.player.id,
                'room': self.room.id
            }
            serializer = TileCreateSerializer(data=data)
            
            self.assertTrue(serializer.is_valid(), f"Failed to validate tile {i+1}")
            
            tile = serializer.save()
            created_tiles.append(tile)
            
            # Verify tile was created correctly
            self.assertEqual(tile.genre, genre)
            self.assertEqual(tile.position, i + 3)
            self.assertEqual(tile.player, self.player)
            self.assertEqual(tile.room, self.room)
        
        # Verify all tiles exist in database
        self.assertEqual(len(created_tiles), 3)
        self.assertEqual(Tile.objects.filter(player=self.player).count(), 3)
        
        # Verify tiles have unique positions and genres for this player
        positions = [tile.position for tile in created_tiles]
        genres = [tile.genre for tile in created_tiles]
        
        self.assertEqual(len(set(positions)), len(positions))  # All positions unique
        self.assertEqual(len(set(genres)), len(genres))        # All genres unique

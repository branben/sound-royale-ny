from django.test import TestCase
from .models import Room, Player, Tile
from .serializers import TileCreateSerializer
import uuid


class TileCreateSerializerSimpleTestCase(TestCase):
    """Simple test for TileCreateSerializer basic functionality"""
    
    def setUp(self):
        """Set up test data"""
        self.room = Room.objects.create(code="1234", name="Test Room")
        self.player = Player.objects.create(
            room=self.room,
            name="TestPlayer",
            is_host=False,
            player_secret=uuid.uuid4()
        )
        self.room.status = Room.Status.LOBBY
        self.room.save()
    
    def test_basic_tile_creation(self):
        """Test basic tile creation works"""
        data = {
            'genre': Tile.Genre.PHONK,
            'position': 0,
            'player': self.player.id,
            'room': self.room.id
        }
        serializer = TileCreateSerializer(data=data)
        
        self.assertTrue(serializer.is_valid())
        
        tile = serializer.save()
        self.assertEqual(tile.genre, Tile.Genre.PHONK)
        self.assertEqual(tile.position, 0)
        self.assertEqual(tile.player, self.player)
        self.assertEqual(tile.room, self.room)

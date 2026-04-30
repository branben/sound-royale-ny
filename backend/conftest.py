import pytest
from django.test import Client
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.conf import settings
from cryptography.fernet import Fernet
import sys
import os

# Add backend to path for imports
sys.path.insert(0, os.path.dirname(__file__))

# Set FERNET_KEY for tests
if not hasattr(settings, 'FERNET_KEY') or not settings.FERNET_KEY:
    os.environ.setdefault('FERNET_KEY', Fernet.generate_key().decode())
    settings.FERNET_KEY = os.environ.get('FERNET_KEY')

# Set DISCORD_CLIENT_ID for tests
if not hasattr(settings, 'DISCORD_CLIENT_ID') or not settings.DISCORD_CLIENT_ID:
    settings.DISCORD_CLIENT_ID = 'test_discord_client_id'
    settings.DISCORD_CLIENT_SECRET = 'test_discord_client_secret'
    settings.FRONTEND_URL = 'http://localhost:8080'

@pytest.fixture
def django_db_setup():
    """Setup Django database for tests."""
    pass

@pytest.fixture
def client():
    """Django test client."""
    return Client()

@pytest.fixture
def verified_user(db):
    """Create a verified user for testing."""
    from game_engine.models import VerifiedUser
    return VerifiedUser.objects.create(
        display_name="TestProducer",
        email="test@example.com",
        email_verified_at=timezone.now(),
        last_seen_at=timezone.now(),
        elo_rating=1200,
        elo_wins=0,
        elo_losses=0,
        elo_matches=0
    )

@pytest.fixture
def room(db):
    """Create a room for testing."""
    from game_engine.models import Room
    return Room.objects.create(
        status=Room.Status.LOBBY,
        current_round=1
    )

@pytest.fixture
def player(db, room, verified_user):
    """Create a player for testing."""
    from game_engine.models import Player
    return Player.objects.create(
        name="TestPlayer",
        room=room,
        verified_user=verified_user,
        is_spectator=False,
        is_host=True,
        is_connected=True,
        is_ready=False
    )

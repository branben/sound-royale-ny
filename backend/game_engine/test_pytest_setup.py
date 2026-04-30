import pytest
from django.utils import timezone


@pytest.mark.django_db
def test_pytest_setup_works(verified_user, room, player):
    """Verify pytest-django setup works correctly."""
    assert verified_user.display_name == "TestProducer"
    assert verified_user.email == "test@example.com"
    assert verified_user.email_verified_at is not None
    assert verified_user.elo_rating == 1200
    
    assert room.status == "lobby"
    assert room.current_round == 1
    
    assert player.name == "TestPlayer"
    assert player.room == room
    assert player.verified_user == verified_user
    assert player.is_host is True
    assert player.is_spectator is False

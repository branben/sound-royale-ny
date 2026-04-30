import pytest
from django.utils import timezone
from game_engine.models import EloDeltaEvent, VerifiedUser, Room, Player


@pytest.mark.django_db
def test_elo_delta_event_creation(verified_user, room):
    """Test that EloDeltaEvent can be created with all required fields."""
    delta = EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1200,
        delta=25,
        new_elo=1225,
        match_result='win',
        reason='round_win',
        idempotency_key='test-key-123'
    )
    
    assert delta.verified_user == verified_user
    assert delta.room == room
    assert delta.previous_elo == 1200
    assert delta.delta == 25
    assert delta.new_elo == 1225
    assert delta.match_result == 'win'
    assert delta.reason == 'round_win'
    assert delta.idempotency_key == 'test-key-123'
    assert delta.created_at is not None


@pytest.mark.django_db
def test_elo_delta_event_append_only_update_raises(verified_user, room):
    """Test that EloDeltaEvent cannot be updated (append-only enforcement)."""
    delta = EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1200,
        delta=25,
        new_elo=1225,
        match_result='win',
        reason='round_win'
    )
    
    # Try to update - should raise ValueError
    with pytest.raises(ValueError, match="append-only"):
        delta.delta = 50
        delta.save()


@pytest.mark.django_db
def test_elo_delta_event_append_only_delete_raises(verified_user, room):
    """Test that EloDeltaEvent cannot be deleted (append-only enforcement)."""
    delta = EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1200,
        delta=25,
        new_elo=1225,
        match_result='win',
        reason='round_win'
    )
    
    # Try to delete - should raise ValueError
    with pytest.raises(ValueError, match="append-only"):
        delta.delete()


@pytest.mark.django_db
def test_elo_delta_event_requires_verified_user(room):
    """Test that EloDeltaEvent requires a verified user."""
    # Try to create without verified_user - should fail at database level
    with pytest.raises(Exception):  # Will raise IntegrityError or similar
        EloDeltaEvent.objects.create(
            verified_user=None,
            room=room,
            previous_elo=1200,
            delta=25,
            new_elo=1225,
            match_result='win',
            reason='round_win'
        )

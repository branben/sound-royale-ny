import pytest
from django.utils import timezone
from unittest.mock import patch
from game_engine.models import EloDeltaEvent, EloIdempotencyKey, VerifiedUser, Room, Player


@pytest.mark.django_db
def test_elo_ledger_creation_on_win(verified_user, room):
    """Test that ELO ledger creates delta on win."""
    # Simulate ELO update with ledger
    delta = EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1200,
        delta=25,
        new_elo=1225,
        match_result='win',
        reason='round_win',
        idempotency_key='test-win-key'
    )
    
    # Verify delta was created
    assert EloDeltaEvent.objects.count() == 1
    assert delta.verified_user == verified_user
    assert delta.delta == 25
    assert delta.match_result == 'win'


@pytest.mark.django_db
def test_elo_ledger_creation_on_loss(verified_user, room):
    """Test that ELO ledger creates delta on loss."""
    delta = EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1200,
        delta=-25,
        new_elo=1175,
        match_result='loss',
        reason='round_loss',
        idempotency_key='test-loss-key'
    )
    
    assert EloDeltaEvent.objects.count() == 1
    assert delta.delta == -25
    assert delta.match_result == 'loss'


@pytest.mark.django_db
def test_idempotency_key_prevents_duplicate(verified_user, room):
    """Test that duplicate idempotency key prevents duplicate delta."""
    from django.db import IntegrityError, transaction
    
    # Create first delta with idempotency key
    EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1200,
        delta=25,
        new_elo=1225,
        match_result='win',
        reason='round_win',
        idempotency_key='duplicate-key'
    )
    
    # Try to create second delta with same key - should fail due to unique constraint
    try:
        with transaction.atomic():
            EloDeltaEvent.objects.create(
                verified_user=verified_user,
                room=room,
                previous_elo=1225,
                delta=25,
                new_elo=1250,
                match_result='win',
                reason='round_win',
                idempotency_key='duplicate-key'
            )
        # Should not reach here
        assert False, "Should have raised IntegrityError"
    except IntegrityError:
        pass  # Expected
    
    # Only one delta should exist
    assert EloDeltaEvent.objects.count() == 1


@pytest.mark.django_db
def test_unverified_player_no_delta(room):
    """Test that unverified player cannot create delta."""
    # Try to create delta with None verified_user
    with pytest.raises(Exception):  # IntegrityError due to FK constraint
        EloDeltaEvent.objects.create(
            verified_user=None,
            room=room,
            previous_elo=1200,
            delta=25,
            new_elo=1225,
            match_result='win',
            reason='round_win'
        )


@pytest.mark.django_db
def test_transaction_atomic_rollback_on_failure(verified_user, room):
    """Test that transaction rolls back on failure."""
    from django.db import transaction
    
    initial_count = EloDeltaEvent.objects.count()
    
    # Attempt transaction that will fail
    try:
        with transaction.atomic():
            # Create delta
            EloDeltaEvent.objects.create(
                verified_user=verified_user,
                room=room,
                previous_elo=1200,
                delta=25,
                new_elo=1225,
                match_result='win',
                reason='round_win'
            )
            # Force rollback by raising exception
            raise ValueError("Force rollback")
    except ValueError:
        pass
    
    # Delta should not have been created due to rollback
    assert EloDeltaEvent.objects.count() == initial_count


@pytest.mark.django_db
def test_elo_delta_event_includes_all_fields(verified_user, room):
    """Test that EloDeltaEvent includes all required fields."""
    delta = EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1200,
        delta=25,
        new_elo=1225,
        match_result='win',
        reason='round_win',
        idempotency_key='all-fields-key'
    )
    
    # Verify all fields are populated
    assert delta.verified_user is not None
    assert delta.room is not None
    assert delta.previous_elo == 1200
    assert delta.delta == 25
    assert delta.new_elo == 1225
    assert delta.match_result == 'win'
    assert delta.reason == 'round_win'
    assert delta.idempotency_key == 'all-fields-key'
    assert delta.created_at is not None

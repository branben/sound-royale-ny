import pytest
from django.utils import timezone
from datetime import timedelta
from game_engine.models import EloIdempotencyKey


@pytest.mark.django_db
def test_idempotency_key_creation():
    """Test that EloIdempotencyKey can be created."""
    key = EloIdempotencyKey.objects.create(
        key="test-key-123",
        expires_at=timezone.now() + timedelta(hours=24)
    )
    
    assert key.key == "test-key-123"
    assert key.consumed_at is None
    assert key.expires_at > timezone.now()
    assert key.created_at is not None


@pytest.mark.django_db
def test_idempotency_key_unique():
    """Test that idempotency keys are unique."""
    EloIdempotencyKey.objects.create(
        key="test-key-123",
        expires_at=timezone.now() + timedelta(hours=24)
    )
    
    # Try to create duplicate - should raise IntegrityError
    with pytest.raises(Exception):  # IntegrityError
        EloIdempotencyKey.objects.create(
            key="test-key-123",
            expires_at=timezone.now() + timedelta(hours=24)
        )


@pytest.mark.django_db
def test_idempotency_key_expiry():
    """Test that expired keys are not consumable."""
    # Create expired key
    expired_key = EloIdempotencyKey.objects.create(
        key="expired-key",
        expires_at=timezone.now() - timedelta(hours=1)
    )
    
    # Should not be consumable
    assert EloIdempotencyKey.is_consumed("expired-key") is False
    assert EloIdempotencyKey.consume("expired-key") is False


@pytest.mark.django_db
def test_idempotency_key_consume():
    """Test that keys can be consumed and prevent double consumption."""
    key = EloIdempotencyKey.objects.create(
        key="consumable-key",
        expires_at=timezone.now() + timedelta(hours=24)
    )
    
    # First consume should succeed
    assert EloIdempotencyKey.consume("consumable-key") is True
    assert EloIdempotencyKey.is_consumed("consumable-key") is True
    
    # Second consume should fail
    assert EloIdempotencyKey.consume("consumable-key") is False


@pytest.mark.django_db
def test_idempotency_key_is_consumed():
    """Test that is_consumed correctly checks consumption status."""
    key = EloIdempotencyKey.objects.create(
        key="check-key",
        expires_at=timezone.now() + timedelta(hours=24)
    )
    
    # Not consumed initially
    assert EloIdempotencyKey.is_consumed("check-key") is False
    
    # Consume it
    EloIdempotencyKey.consume("check-key")
    
    # Now consumed
    assert EloIdempotencyKey.is_consumed("check-key") is True

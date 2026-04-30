import pytest
from django.utils import timezone
from game_engine.models import DiscordIdentity, VerifiedUser
from cryptography.fernet import Fernet


@pytest.mark.django_db
def test_discord_identity_unique_per_user(verified_user):
    """Test that Discord identity is unique per verified user (OneToOne)."""
    # Create first Discord identity
    identity = DiscordIdentity.objects.create(
        verified_user=verified_user,
        discord_id='123456789',
        discord_username='testuser',
        discord_avatar='abc123',
        token_expires_at='2024-01-01T00:00:00Z'
    )
    identity.set_tokens('access_token_1', 'refresh_token_1')
    identity.save()
    
    # Try to create second Discord identity for same user - should fail
    with pytest.raises(Exception):  # IntegrityError due to OneToOne
        identity2 = DiscordIdentity.objects.create(
            verified_user=verified_user,
            discord_id='987654321',
            discord_username='anotheruser',
            discord_avatar='xyz789',
            token_expires_at='2024-01-01T00:00:00Z'
        )
        identity2.set_tokens('access_token_2', 'refresh_token_2')
        identity2.save()


@pytest.mark.django_db
def test_discord_identity_token_encryption(verified_user):
    """Test that Discord tokens are encrypted."""
    discord_id = DiscordIdentity.objects.create(
        verified_user=verified_user,
        discord_id='123456789',
        discord_username='testuser',
        discord_avatar='abc123',
        token_expires_at='2024-01-01T00:00:00Z'
    )
    discord_id.set_tokens('raw_access_token', 'raw_refresh_token')
    discord_id.save()
    
    # Access token should be encrypted (not stored as plaintext)
    assert discord_id.access_token != 'raw_access_token'
    assert discord_id.refresh_token != 'raw_refresh_token'
    
    # Decryption should work
    decrypted_access = discord_id.get_access_token()
    decrypted_refresh = discord_id.get_refresh_token()
    assert decrypted_access == 'raw_access_token'
    assert decrypted_refresh == 'raw_refresh_token'


@pytest.mark.django_db
def test_discord_identity_discord_id_unique(verified_user):
    """Test that Discord ID is unique (prevent multiple accounts linking same Discord)."""
    identity = DiscordIdentity.objects.create(
        verified_user=verified_user,
        discord_id='123456789',
        discord_username='testuser',
        discord_avatar='abc123',
        token_expires_at='2024-01-01T00:00:00Z'
    )
    identity.set_tokens('access_token_1', 'refresh_token_1')
    identity.save()
    
    # Try to create identity with same Discord ID for different user - should fail
    other_user = VerifiedUser.objects.create(
        display_name='OtherUser',
        email='other@example.com',
        email_verified_at=timezone.now(),
        last_seen_at=timezone.now(),
        elo_rating=1200,
        elo_wins=0,
        elo_losses=0,
        elo_matches=0
    )
    
    with pytest.raises(Exception):  # IntegrityError due to unique discord_id
        identity2 = DiscordIdentity.objects.create(
            verified_user=other_user,
            discord_id='123456789',  # Same Discord ID
            discord_username='testuser',
            discord_avatar='abc123',
            token_expires_at='2024-01-01T00:00:00Z'
        )
        identity2.set_tokens('access_token_2', 'refresh_token_2')
        identity2.save()

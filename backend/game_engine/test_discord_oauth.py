import pytest
from django.test import Client
from django.urls import reverse
from game_engine.models import DiscordIdentity, VerifiedUser


@pytest.mark.django_db
def test_oauth_start_redirects(verified_user):
    """Test that OAuth start redirects to Discord."""
    client = Client()
    session = client.session
    session['verified_user_id'] = str(verified_user.id)
    session.save()
    
    url = reverse('discord-oauth-start')
    response = client.get(url)
    
    # Should redirect to Discord authorization URL
    assert response.status_code == 302
    assert 'discord.com' in response.url


@pytest.mark.django_db
def test_oauth_callback_creates_identity(verified_user):
    """Test that OAuth callback creates DiscordIdentity."""
    # This test would need to mock Discord's OAuth response
    # For now, this is a placeholder for the actual implementation
    pass


@pytest.mark.django_db
def test_oauth_callback_links_to_existing_user(verified_user):
    """Test that OAuth callback links to existing verified user."""
    # This test would need to mock Discord's OAuth response
    # For now, this is a placeholder for the actual implementation
    pass

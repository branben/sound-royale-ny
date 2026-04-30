import pytest
from django.test import Client
from django.urls import reverse
from game_engine.models import EloDeltaEvent, VerifiedUser, Room, Player


@pytest.mark.django_db
def test_ledger_endpoint_requires_auth():
    """Test that ledger endpoint requires authentication."""
    client = Client()
    url = reverse('elo-ledger-me')
    response = client.get(url)
    assert response.status_code == 401


@pytest.mark.django_db
def test_ledger_endpoint_with_auth(verified_user, room):
    """Test that ledger endpoint returns data for authenticated user."""
    # Create some delta events
    EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1200,
        delta=25,
        new_elo=1225,
        match_result='win',
        reason='round_win'
    )
    
    client = Client()
    session = client.session
    session['verified_user_id'] = str(verified_user.id)
    session.save()
    
    url = reverse('elo-ledger-me')
    response = client.get(url)
    
    assert response.status_code == 200
    data = response.json()
    assert 'results' in data
    assert data['count'] == 1
    assert len(data['results']) == 1
    assert data['results'][0]['delta'] == 25


@pytest.mark.django_db
def test_ledger_pagination(verified_user, room):
    """Test that ledger endpoint supports pagination."""
    # Create 25 delta events
    for i in range(25):
        EloDeltaEvent.objects.create(
            verified_user=verified_user,
            room=room,
            previous_elo=1200 + i * 25,
            delta=25,
            new_elo=1225 + i * 25,
            match_result='win',
            reason='round_win'
        )
    
    client = Client()
    session = client.session
    session['verified_user_id'] = str(verified_user.id)
    session.save()
    
    url = reverse('elo-ledger-me')
    
    # First page with page_size=10
    response = client.get(url, {'page_size': 10, 'page': 1})
    assert response.status_code == 200
    data = response.json()
    assert data['count'] == 25
    assert data['page'] == 1
    assert data['page_size'] == 10
    assert len(data['results']) == 10
    
    # Second page
    response = client.get(url, {'page_size': 10, 'page': 2})
    assert response.status_code == 200
    data = response.json()
    assert data['page'] == 2
    assert len(data['results']) == 10


@pytest.mark.django_db
def test_summary_correct(verified_user, room):
    """Test that summary endpoint returns correct ELO summary."""
    # Create delta events
    EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1200,
        delta=25,
        new_elo=1225,
        match_result='win',
        reason='round_win'
    )
    EloDeltaEvent.objects.create(
        verified_user=verified_user,
        room=room,
        previous_elo=1225,
        delta=-25,
        new_elo=1200,
        match_result='loss',
        reason='round_loss'
    )
    
    client = Client()
    session = client.session
    session['verified_user_id'] = str(verified_user.id)
    session.save()
    
    url = reverse('elo-summary-me')
    response = client.get(url)
    
    assert response.status_code == 200
    data = response.json()
    assert data['elo_rating'] == 1200  # Net 0 change
    assert data['elo_wins'] == 1
    assert data['elo_losses'] == 1
    assert data['elo_matches'] == 2
    assert data['total_deltas'] == 2


@pytest.mark.django_db
def test_user_summary_public(verified_user, room):
    """Test that user summary endpoint is publicly accessible."""
    client = Client()
    url = reverse('elo-user-summary', kwargs={'user_id': verified_user.id})
    response = client.get(url)
    
    assert response.status_code == 200
    data = response.json()
    assert 'elo_rating' in data
    assert 'elo_wins' in data

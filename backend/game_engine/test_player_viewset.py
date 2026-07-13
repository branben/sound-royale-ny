import pytest
from django.test import TestCase
from django.urls import reverse
from django.db import transaction, IntegrityError
from rest_framework import status
from rest_framework.test import APITestCase
from .models import Room, Player, Tile
from .serializers import PlayerCreateSerializer
import uuid


pytestmark = [pytest.mark.integration, pytest.mark.routing]


class PlayerViewSetTestCase(APITestCase):
    """Test PlayerViewSet routing and actions"""
    
    def setUp(self):
        """Set up test data"""
        self.room = Room.objects.create(code="1234")
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
    
    def test_player_retrieve_by_player_secret(self):
        """Test retrieving player by player_secret"""
        url = reverse('player-detail', kwargs={'player_secret': str(self.player.player_secret)})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'TestPlayer')
    
    def test_player_retrieve_by_uuid_fallback(self):
        """Test retrieving player by UUID as fallback (not supported with current routing)"""
        # This test is skipped because PlayerViewSet only supports player_secret lookup
        # UUID fallback would require additional URL configuration
        self.skipTest("UUID fallback not supported with current player_secret-only routing")
    
    def test_player_retrieve_not_found(self):
        """Test retrieving non-existent player"""
        url = reverse('player-detail', kwargs={'player_secret': str(uuid.uuid4())})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_update_score_action_success(self):
        """Test update_score action with valid data"""
        url = reverse('player-update-score', kwargs={'player_secret': str(self.player.player_secret)})
        data = {'score_delta': 100}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'Score update received')
        self.assertEqual(response.data['player'], 'TestPlayer')
        self.assertEqual(response.data['score_delta'], 100)
    
    def test_update_score_action_invalid_delta(self):
        """Test update_score action with invalid score_delta"""
        url = reverse('player-update-score', kwargs={'player_secret': str(self.player.player_secret)})
        data = {'score_delta': 'invalid'}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('score_delta must be a number', response.data['error'])
    
    def test_update_score_action_missing_delta(self):
        """Test update_score action without score_delta"""
        url = reverse('player-update-score', kwargs={'player_secret': str(self.player.player_secret)})
        response = self.client.post(url, {}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['score_delta'], 0)  # Default value
    
    def test_toggle_connection_action(self):
        """Test toggle_connection action"""
        # Initial state (players default to False)
        self.assertFalse(self.player.is_connected)
        
        url = reverse('player-toggle-connection', kwargs={'player_secret': str(self.player.player_secret)})
        response = self.client.post(url, {}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'Connection toggled')
        self.assertEqual(response.data['player'], 'TestPlayer')
        self.assertTrue(response.data['is_connected'])  # Should toggle to True
        
        # Verify database state
        self.player.refresh_from_db()
        self.assertTrue(self.player.is_connected)
    
    def test_toggle_connection_action_twice(self):
        """Test toggle_connection action called twice"""
        url = reverse('player-toggle-connection', kwargs={'player_secret': str(self.player.player_secret)})
        
        # First toggle (False -> True)
        response1 = self.client.post(url, {}, format='json')
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        self.assertTrue(response1.data['is_connected'])
        
        # Second toggle (True -> False)
        response2 = self.client.post(url, {}, format='json')
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        self.assertFalse(response2.data['is_connected'])
    
    def test_player_list_forbidden(self):
        """Global player listing is intentionally forbidden (security finding global_list_exposure)."""
        url = reverse('player-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_join_game_creates_player_success(self):
        """Players are created via room-join-game (generic PlayerViewSet.create is 405 by design)."""
        url = reverse('room-join-game', kwargs={'code': '1234'})
        data = {
            'name': 'NewPlayer',
            'is_spectator': False,
        }
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'NewPlayer')
        self.assertTrue(Player.objects.filter(name='NewPlayer').exists())

    def test_join_game_rejects_duplicate_name(self):
        """Duplicate player name in a room is rejected with 409 via join_game (not a raw IntegrityError on generic create)."""
        url = reverse('room-join-game', kwargs={'code': '1234'})
        data = {
            'name': 'TestPlayer',  # already exists (self.player) in this room
            'is_spectator': False,
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data.get('conflict_type'), 'duplicate_name')

    def test_action_urls_use_player_secret(self):
        """Test that action URLs use player_secret parameter"""
        # These URLs should use player_secret, not pk
        update_score_url = reverse('player-update-score', kwargs={'player_secret': str(self.player.player_secret)})
        toggle_connection_url = reverse('player-toggle-connection', kwargs={'player_secret': str(self.player.player_secret)})
        
        # Verify URLs contain player_secret
        self.assertIn(str(self.player.player_secret), update_score_url)
        self.assertIn(str(self.player.player_secret), toggle_connection_url)
        
        # Verify URLs don't contain 'pk'
        self.assertNotIn('pk', update_score_url)
        self.assertNotIn('pk', toggle_connection_url)


class PlayerViewSetRoutingTestCase(TestCase):
    """Test ViewSet routing parameter handling"""
    
    def test_viewset_lookup_field_configuration(self):
        """Test that PlayerViewSet is configured to use player_secret"""
        from .views import PlayerViewSet
        
        self.assertEqual(PlayerViewSet.lookup_field, "player_secret")
    
    def test_action_method_signatures(self):
        """Test that action methods accept both pk and player_secret parameters"""
        from .views import PlayerViewSet
        import inspect
        
        # Check update_score method signature
        update_score_sig = inspect.signature(PlayerViewSet.update_score)
        update_score_params = list(update_score_sig.parameters.keys())
        self.assertIn('pk', update_score_params)
        self.assertIn('player_secret', update_score_params)
        
        # Check toggle_connection method signature
        toggle_connection_sig = inspect.signature(PlayerViewSet.toggle_connection)
        toggle_connection_params = list(toggle_connection_sig.parameters.keys())
        self.assertIn('pk', toggle_connection_params)
        self.assertIn('player_secret', toggle_connection_params)

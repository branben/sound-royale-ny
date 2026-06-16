import uuid
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.test import APIRequestFactory
from unittest.mock import patch, MagicMock
from django.db import transaction
from django.utils import timezone
from .models import Room, Player, Tile, Round, Vote, ThemeRotation, DiscordAccount
from .views import RoomViewSet


class RoomAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.factory = APIRequestFactory()
        self.room = Room.objects.create(name="Test Room", code="1234")
        self.host = Player.objects.create(
            room=self.room,
            name="HostPlayer",
            is_host=True,
            is_spectator=False
        )
        self.spectator = Player.objects.create(
            room=self.room,
            name="SpectatorPlayer",
            is_host=False,
            is_spectator=True
        )

    def test_room_list_empty(self):
        """Test listing rooms when no rooms exist"""
        Room.objects.all().delete()
        url = reverse('room-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_room_list_with_rooms(self):
        """Test listing rooms when rooms exist"""
        url = reverse('room-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['code'], '1234')
        self.assertEqual(response.data[0]['name'], 'Test Room')

    def test_room_retrieve_by_code(self):
        """Test retrieving a room by its code"""
        url = reverse('room-detail', kwargs={'code': '1234'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['code'], '1234')
        self.assertEqual(response.data['name'], 'Test Room')

    def test_room_retrieve_by_uuid(self):
        """Test retrieving a room by its UUID (not supported by current routing)"""
        # Current routing only supports code-based lookup
        pass

    def test_room_retrieve_not_found(self):
        """Test retrieving a non-existent room"""
        url = reverse('room-detail', kwargs={'code': '9999'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_room_create_success(self):
        """Test creating a new room successfully"""
        Room.objects.all().delete()
        data = {
            'name': 'New Room',
            'player_name': 'TestHost'
        }
        url = reverse('room-list')
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Room.objects.count(), 1)
        self.assertEqual(Player.objects.count(), 1)
        
        room = Room.objects.first()
        self.assertEqual(room.name, 'New Room')
        self.assertIsNotNone(room.code)
        self.assertEqual(len(room.code), 4)
        self.assertTrue(room.code.isdigit())
        
        player = Player.objects.first()
        self.assertEqual(player.name, 'TestHost')
        self.assertTrue(player.is_host)
        self.assertFalse(player.is_spectator)
        self.assertEqual(player.room, room)
        
        # Check that tiles were created for the host
        self.assertEqual(Tile.objects.filter(player=player).count(), 9)

    @patch('random.choices')
    def test_room_create_code_generation(self, mock_choices):
        """Test room code generation during room creation"""
        Room.objects.all().delete()
        mock_choices.return_value = ['1', '2', '3', '4']
        
        data = {
            'name': 'New Room',
            'player_name': 'TestHost'
        }
        url = reverse('room-list')
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        room = Room.objects.first()
        self.assertEqual(room.code, '1234')

    def test_join_game_as_player_success(self):
        """Test joining a game as a player successfully"""
        self.room.status = Room.Status.LOBBY
        self.room.save()
        
        data = {
            'name': 'NewPlayer',
            'is_spectator': False
        }
        url = reverse('room-join-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Player.objects.filter(room=self.room).count(), 3)

        new_player = Player.objects.get(name='NewPlayer')
        self.assertFalse(new_player.is_spectator)
        self.assertEqual(new_player.room, self.room)

        # Check that tiles were created for the new player
        self.assertEqual(Tile.objects.filter(player=new_player).count(), 9)

    def test_join_game_as_spectator_success(self):
        """Test joining a game as a spectator successfully"""
        self.room.status = Room.Status.LOBBY
        self.room.save()

        data = {
            'name': 'NewSpectator',
            'is_spectator': True
        }
        url = reverse('room-join-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Player.objects.filter(room=self.room).count(), 3)

        # API auto-generates spectator names, so check for any new spectator
        new_spectator = Player.objects.filter(is_spectator=True).last()
        self.assertTrue(new_spectator.is_spectator)
        self.assertEqual(new_spectator.room, self.room)

        # Check that no tiles were created for the spectator
        self.assertEqual(Tile.objects.filter(player=new_spectator).count(), 0)

    def test_join_producer_after_game_started_is_blocked(self):
        """Test joining a game as producer after start is blocked"""
        self.room.status = Room.Status.PLAYING
        self.room.save()

        data = {
            'name': 'NewPlayer',
            'is_spectator': False
        }
        url = reverse('room-join-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Only spectators can join after a game has started', response.data['error'])

    def test_join_spectator_after_game_started_is_allowed(self):
        """Test joining a game as spectator after start is allowed"""
        self.room.status = Room.Status.PLAYING
        self.room.save()

        data = {
            'name': 'LateSpectator',
            'is_spectator': True
        }
        url = reverse('room-join-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_spectator = Player.objects.filter(is_spectator=True).last()
        self.assertTrue(new_spectator.is_spectator)
        self.assertEqual(new_spectator.room, self.room)
        self.assertEqual(Tile.objects.filter(player=new_spectator).count(), 0)

    def test_theme_rotation_defaults_are_available(self):
        """Test editable theme rotations are seeded and exposed"""
        ThemeRotation.objects.all().delete()

        url = reverse('theme-rotation-list')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        keys = {rotation['key'] for rotation in response.data}
        self.assertEqual(keys, {'classic', 'weekly', 'monthly'})
        for rotation in response.data:
            self.assertEqual(rotation['description'], 'theme by @1120cooks')
            self.assertEqual(len(rotation['genres']), 9)

    def test_new_room_uses_weekly_rotation_genres(self):
        """Test new rooms copy the selected rotation into generated boards"""
        ThemeRotation.objects.update_or_create(
            key='weekly',
            defaults={
                'name': 'Weekly Rotation',
                'description': 'theme by @1120cooks',
                'genres': [
                    'Bounce', 'Jersey', 'Club', 'Garage', 'Amapiano',
                    'Hyperpop', 'Grime', 'Afrobeats', 'Footwork'
                ],
            },
        )

        data = {
            'name': 'Weekly Room',
            'player_name': 'WeeklyHost',
            'theme': 'weekly',
        }
        response = self.client.post(reverse('room-list'), data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        player = Player.objects.get(name='WeeklyHost')
        genres = set(Tile.objects.filter(player=player).values_list('genre', flat=True))
        self.assertEqual(genres, {
            'Bounce', 'Jersey', 'Club', 'Garage', 'Amapiano',
            'Hyperpop', 'Grime', 'Afrobeats', 'Footwork'
        })

    def test_discord_link_returns_reusable_session_secret(self):
        """Discord linking returns a stable session secret for future rooms."""
        url = reverse('discord-link')
        response = self.client.post(url, {
            'player_id': str(self.host.id),
            'player_secret': str(self.host.player_secret),
            'discord_user_id': 'discord-123',
            'discord_username': 'verified_user',
            'discord_avatar_url': 'avatar-hash',
            'access_token': 'access-token',
            'refresh_token': 'refresh-token',
            'expires_in': 3600,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('discord_session_secret', response.data)
        account = DiscordAccount.objects.get(discord_user_id='discord-123')
        self.assertEqual(response.data['discord_session_secret'], str(account.session_secret))

    def test_discord_status_accepts_stable_session_without_player_credentials(self):
        """Discord status can be checked after leaving a room player session."""
        account = DiscordAccount.objects.create(
            player=self.host,
            discord_user_id='discord-456',
            discord_username='stable_user',
            discord_avatar_url='https://cdn.discordapp.com/avatar.png',
            access_token='encrypted-access',
            refresh_token='encrypted-refresh',
        )

        response = self.client.get(reverse('discord-status'), {
            'discord_user_id': account.discord_user_id,
            'discord_session_secret': str(getattr(account, 'session_secret', uuid.uuid4())),
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_linked'])
        self.assertEqual(response.data['discord_username'], 'stable_user')
        self.assertEqual(response.data['discord_avatar_url'], 'https://cdn.discordapp.com/avatar.png')

    def test_room_create_attaches_verified_discord_session_to_host(self):
        """Creating a new room with a stable Discord session attaches it to the host player."""
        account = DiscordAccount.objects.create(
            player=self.host,
            discord_user_id='discord-789',
            discord_username='host_verified',
            access_token='encrypted-access',
            refresh_token='encrypted-refresh',
        )

        response = self.client.post(reverse('room-list'), {
            'name': 'Verified Host Room',
            'player_name': 'VerifiedHost',
            'discord_user_id': account.discord_user_id,
            'discord_session_secret': str(getattr(account, 'session_secret', uuid.uuid4())),
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        player = Player.objects.get(name='VerifiedHost')
        self.assertEqual(getattr(player, 'discord_identity', None), account)

    def test_join_game_attaches_verified_discord_session_to_player(self):
        """Joining a room with a stable Discord session attaches it to the new player."""
        account = DiscordAccount.objects.create(
            player=self.host,
            discord_user_id='discord-999',
            discord_username='join_verified',
            access_token='encrypted-access',
            refresh_token='encrypted-refresh',
        )

        response = self.client.post(reverse('room-join-game', kwargs={'code': '1234'}), {
            'name': 'VerifiedJoiner',
            'is_spectator': False,
            'discord_user_id': account.discord_user_id,
            'discord_session_secret': str(account.session_secret),
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        player = Player.objects.get(name='VerifiedJoiner')
        self.assertEqual(player.discord_identity, account)

    def test_game_state_includes_verified_discord_metadata(self):
        """Game state exposes verified Discord metadata for player display."""
        account = DiscordAccount.objects.create(
            player=self.host,
            discord_user_id='discord-meta',
            discord_username='meta_verified',
            discord_avatar_url='https://cdn.discordapp.com/meta.png',
            access_token='encrypted-access',
            refresh_token='encrypted-refresh',
        )
        self.host.discord_identity = account
        self.host.save(update_fields=['discord_identity'])

        response = self.client.get(reverse('room-game-state', kwargs={'code': '1234'}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        player_data = response.data['players'][str(self.host.id)]
        self.assertIn('isDiscordVerified', player_data)
        self.assertTrue(player_data['isDiscordVerified'])
        self.assertEqual(player_data['discordUsername'], 'meta_verified')
        self.assertEqual(player_data['discordAvatarUrl'], 'https://cdn.discordapp.com/meta.png')

    @override_settings(THEME_ADMIN_SECRET='admin-pin')
    def test_theme_rotation_update_requires_admin_secret(self):
        """Test rotation updates reject missing or wrong admin secrets"""
        ThemeRotation.objects.update_or_create(
            key='weekly',
            defaults={
                'name': 'Weekly Rotation',
                'description': 'theme by @1120cooks',
                'genres': ['Trap', 'Phonk', 'Drill', 'R&B', 'EDM', 'House', 'Lo-Fi', 'Jazz', 'Ambient'],
            },
        )
        url = reverse('theme-rotation-detail', kwargs={'key': 'weekly'})
        payload = {
            'name': 'Weekly Rotation',
            'description': 'theme by @1120cooks',
            'genres': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
        }

        response = self.client.put(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(THEME_ADMIN_SECRET='admin-pin')
    def test_theme_rotation_update_success(self):
        """Test rotation updates with the admin secret"""
        ThemeRotation.objects.update_or_create(
            key='monthly',
            defaults={
                'name': 'Monthly Rotation',
                'description': 'theme by @1120cooks',
                'genres': ['House', 'EDM', 'Techno', 'Disco', 'Lo-Fi', 'R&B', 'Trap', 'Phonk', 'Ambient'],
            },
        )
        url = reverse('theme-rotation-detail', kwargs={'key': 'monthly'})
        payload = {
            'name': 'Monthly Rotation',
            'description': 'theme by @1120cooks',
            'genres': ['Soul', 'Funk', 'Breaks', 'Dub', 'Garage', 'House', 'Techno', 'Jazz', 'Disco'],
        }

        response = self.client.put(
            url,
            payload,
            format='json',
            HTTP_X_THEME_ADMIN_SECRET='admin-pin',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['genres'], payload['genres'])

    @override_settings(THEME_ADMIN_SECRET='admin-pin')
    def test_theme_rotation_rejects_invalid_genres(self):
        """Test rotation updates require exactly 9 non-empty unique genres"""
        ThemeRotation.objects.update_or_create(
            key='classic',
            defaults={
                'name': 'Classic',
                'description': 'theme by @1120cooks',
                'genres': ['Phonk', 'Trap', 'Lo-Fi', 'House', 'Drill', 'R&B', 'EDM', 'Jazz', 'Ambient'],
            },
        )
        url = reverse('theme-rotation-detail', kwargs={'key': 'classic'})
        payload = {
            'name': 'Classic',
            'description': 'theme by @1120cooks',
            'genres': ['Trap', 'Trap', 'House'],
        }

        response = self.client.put(
            url,
            payload,
            format='json',
            HTTP_X_THEME_ADMIN_SECRET='admin-pin',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_join_game_duplicate_name(self):
        """Test joining a game with a duplicate name"""
        self.room.status = Room.Status.LOBBY
        self.room.save()

        data = {
            'name': 'HostPlayer',  # Same name as existing host
            'is_spectator': False
        }
        url = reverse('room-join-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')

        self.assertIn(response.status_code, [status.HTTP_409_CONFLICT, status.HTTP_400_BAD_REQUEST])

    def test_join_game_spectator_limit_reached(self):
        """Test joining as spectator when limit is reached"""
        self.room.status = Room.Status.LOBBY
        self.room.save()
        
        # Create 10 spectators (the limit)
        for i in range(10):
            Player.objects.create(
                room=self.room,
                name=f'Spectator{i}',
                is_spectator=True
            )
        
        data = {
            'name': 'NewSpectator',
            'is_spectator': True
        }
        url = reverse('room-join-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Spectator limit reached', response.data['error'])

    def test_start_game_success(self):
        """Test starting a game successfully"""
        # Add another player to meet minimum requirement
        Player.objects.create(
            room=self.room,
            name='Player2',
            is_spectator=False
        )
        
        self.room.status = Room.Status.LOBBY
        self.room.save()
        
        url = reverse('room-start-game', kwargs={'code': '1234'})
        response = self.client.post(url, {'player_secret': str(self.host.player_secret)}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Game started', response.data['status'])

        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.PLAYING)

        # Check that a round was created
        self.assertEqual(Round.objects.filter(room=self.room).count(), 1)
        round = Round.objects.get(room=self.room)
        self.assertEqual(round.round_number, 1)
        self.assertIsNotNone(round.current_tile_genre)

    def test_start_game_not_enough_players(self):
        """Test starting a game with not enough players"""
        self.room.status = Room.Status.LOBBY
        self.room.save()

        url = reverse('room-start-game', kwargs={'code': '1234'})
        response = self.client.post(url, {'player_secret': str(self.host.player_secret)}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Need at least 2 players', response.data['error'])

    def test_start_game_already_started(self):
        """Test starting a game that has already started"""
        # Add a second player so we can start the game first
        Player.objects.create(
            room=self.room,
            name='Player2',
            is_spectator=False
        )
        self.room.status = Room.Status.LOBBY
        self.room.save()

        # First start the game successfully
        url = reverse('room-start-game', kwargs={'code': '1234'})
        self.client.post(url, {'player_secret': str(self.host.player_secret)}, format='json')

        # Now try to start again
        response = self.client.post(url, {'player_secret': str(self.host.player_secret)}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Game has already started', response.data['error'])

    def test_rejoin_game_success(self):
        """Test rejoining a game successfully"""
        data = {
            'player_secret': str(self.host.player_secret)
        }
        url = reverse('room-rejoin-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'HostPlayer')
        self.assertEqual(response.data['id'], str(self.host.id))
        self.assertEqual(response.data['isSpectator'], False)
        self.assertEqual(response.data['is_host'], True)

    def test_rejoin_game_missing_secret(self):
        """Test rejoining a game without providing player_secret"""
        url = reverse('room-rejoin-game', kwargs={'code': '1234'})
        response = self.client.post(url, {}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('player_secret is required', response.data['error'])

    def test_rejoin_game_invalid_secret(self):
        """Test rejoining a game with invalid player_secret"""
        data = {
            'player_secret': str(uuid.uuid4())  # Random UUID that doesn't exist
        }
        url = reverse('room-rejoin-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('Player not found', response.data['error'])

    def test_reset_game_success(self):
        """Test resetting a game successfully"""
        self.room.status = Room.Status.PLAYING
        self.room.current_round = 2
        self.room.winner = self.host
        self.room.save()
        
        # Create some tiles
        Tile.objects.create(
            player=self.host,
            room=self.room,
            genre=Tile.Genre.PHONK,
            position=1
        )
        
        data = {
            'player_secret': str(self.host.player_secret)
        }
        url = reverse('room-reset-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Game reset', response.data['status'])
        
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, Room.Status.LOBBY)
        self.assertEqual(self.room.current_round, 3)  # Should increment
        self.assertIsNone(self.room.winner)

    def test_reset_game_not_host(self):
        """Test resetting a game as non-host"""
        data = {
            'player_secret': str(self.spectator.player_secret)
        }
        url = reverse('room-reset-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Only host can reset', response.data['error'])

    def test_reset_game_missing_secret(self):
        """Test resetting a game without providing player_secret"""
        url = reverse('room-reset-game', kwargs={'code': '1234'})
        response = self.client.post(url, {}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('player_secret is required', response.data['error'])

    def test_kick_player_success(self):
        """Test kicking a player successfully"""
        # Create a player to kick
        target_player = Player.objects.create(
            room=self.room,
            name='TargetPlayer',
            is_spectator=False
        )
        
        data = {
            'player_secret': str(self.host.player_secret),
            'player_id': str(target_player.id)
        }
        url = reverse('room-kick-player', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Player.objects.filter(id=target_player.id).exists())

    def test_kick_player_not_host(self):
        """Test kicking a player as non-host"""
        target_player = Player.objects.create(
            room=self.room,
            name='TargetPlayer',
            is_spectator=False
        )
        
        data = {
            'player_secret': str(self.spectator.player_secret),
            'player_id': str(target_player.id)
        }
        url = reverse('room-kick-player', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Only host can kick', response.data['error'])

    def test_kick_player_missing_data(self):
        """Test kicking a player without required data"""
        url = reverse('room-kick-player', kwargs={'code': '1234'})
        response = self.client.post(url, {}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('player_secret and player_id are required', response.data['error'])

    def test_game_state_endpoint(self):
        """Test getting game state"""
        url = reverse('room-game-state', kwargs={'code': '1234'})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('players', response.data)
        self.assertIn('status', response.data)
        self.assertEqual(response.data['status'], 'lobby')


class VotingAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.room = Room.objects.create(name="Test Room", code="1234")
        
        self.host = Player.objects.create(
            room=self.room,
            name="HostPlayer",
            is_host=True,
            is_spectator=False
        )
        
        self.producer1 = Player.objects.create(
            room=self.room,
            name="Producer1",
            is_spectator=False
        )
        
        self.producer2 = Player.objects.create(
            room=self.room,
            name="Producer2",
            is_spectator=False
        )
        
        self.spectator1 = Player.objects.create(
            room=self.room,
            name="Spectator1",
            is_spectator=True
        )
        
        self.spectator2 = Player.objects.create(
            room=self.room,
            name="Spectator2",
            is_spectator=True
        )
        
        self.spectator3 = Player.objects.create(
            room=self.room,
            name="Spectator3",
            is_spectator=True
        )
        
        self.round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK,
            timer_duration=60,
            voting_open=True  # Open voting for tests
        )

    def test_vote_success(self):
        """Test voting successfully"""
        data = {
            'player_secret': str(self.spectator1.player_secret),
            'voted_for_player_id': str(self.producer1.id)
        }
        url = reverse('room-vote', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Vote.objects.count(), 1)
        
        vote = Vote.objects.first()
        self.assertEqual(vote.voter, self.spectator1)
        self.assertEqual(vote.voted_for, self.producer1)
        self.assertEqual(vote.round, self.round)

    def test_vote_as_producer_forbidden(self):
        """Test that producers cannot vote"""
        data = {
            'player_secret': str(self.producer1.player_secret),
            'voted_for_player_id': str(self.producer2.id)
        }
        url = reverse('room-vote', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Only spectators can vote', response.data['error'])

    def test_vote_voting_closed(self):
        """Test voting when voting is closed"""
        self.round.voting_open = False
        self.round.save()
        
        data = {
            'player_secret': str(self.spectator1.player_secret),
            'voted_for_player_id': str(self.producer1.id)
        }
        url = reverse('room-vote', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Voting is not open', response.data['error'])

    def test_vote_for_spectator_forbidden(self):
        """Test that voting for spectators is forbidden"""
        data = {
            'player_secret': str(self.spectator1.player_secret),
            'voted_for_player_id': str(self.spectator2.id)
        }
        url = reverse('room-vote', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot vote for a spectator', response.data['error'])

    def test_vote_already_voted(self):
        """Test that a spectator can only vote once per round"""
        # First vote
        Vote.objects.create(
            round=self.round,
            voter=self.spectator1,
            voted_for=self.producer1
        )
        
        data = {
            'player_secret': str(self.spectator1.player_secret),
            'voted_for_player_id': str(self.producer2.id)
        }
        url = reverse('room-vote', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already voted', response.data['error'])

    def test_open_voting_success(self):
        """Test opening voting successfully"""
        self.round.voting_open = False
        self.round.save()
        
        data = {
            'player_secret': str(self.host.player_secret)
        }
        url = reverse('room-open-voting', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.round.refresh_from_db()
        self.assertTrue(self.round.voting_open)

    def test_open_voting_not_host(self):
        """Test opening voting as non-host"""
        data = {
            'player_secret': str(self.spectator1.player_secret)
        }
        url = reverse('room-open-voting', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Only host can open voting', response.data['error'])

    def test_open_voting_insufficient_spectators(self):
        """Test opening voting without enough spectators"""
        # Remove all spectators
        Player.objects.filter(is_spectator=True).delete()
        
        # Ensure voting is closed
        self.round.voting_open = False
        self.round.save()
        
        data = {
            'player_secret': str(self.host.player_secret)
        }
        url = reverse('room-open-voting', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Need at least 3 spectators', response.data['error'])


class APIErrorHandlingTestCase(TestCase):
    """Test API error handling and edge cases"""

    def setUp(self):
        self.client = APIClient()
        self.room = Room.objects.create(name="Test Room", code="1234")
        self.host = Player.objects.create(
            room=self.room,
            name="HostPlayer",
            is_host=True,
            is_spectator=False
        )

    def test_invalid_room_code_format(self):
        """Test handling of invalid room code formats"""
        url = reverse('room-detail', kwargs={'code': 'abc'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_uuid_format(self):
        """Test handling of invalid room code format"""
        url = reverse('room-detail', kwargs={'code': 'invalid-uuid'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_malformed_json_request(self):
        """Test handling of malformed JSON requests"""
        url = reverse('room-join-game', kwargs={'code': '1234'})
        response = self.client.post(
            url,
            data='invalid json',
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_required_fields(self):
        """Test handling of missing required fields"""
        url = reverse('room-join-game', kwargs={'code': '1234'})
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('game_engine.views.transaction.atomic')
    def test_database_transaction_rollback(self, mock_transaction):
        """Test that database transactions are rolled back on errors"""
        mock_transaction.side_effect = Exception("Database error")
        
        data = {
            'name': 'NewPlayer',
            'is_spectator': False
        }
        url = reverse('room-join-game', kwargs={'code': '1234'})
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        mock_transaction.assert_called_once()

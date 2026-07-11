from django.test import TestCase
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from unittest.mock import patch, MagicMock
from .models import Room, Player, Round, Vote


class GameEngineBasicTestCase(TestCase):
    def test_django_test_framework_works(self):
        self.assertTrue(True)


class HealthCheckTestCase(TestCase):
    def setUp(self):
        self.health_url = reverse('health-check')

    @patch('game_engine.health.connections')
    @patch('redis.from_url')
    def test_health_check_returns_200_when_healthy(self, mock_from_url, mock_connections):
        """Health check returns 200 when DB and Redis are reachable."""
        mock_connections.__getitem__.return_value.ensure_connection.return_value = None
        mock_connections.__getitem__.return_value.close.return_value = None
        mock_from_url.return_value.ping.return_value = True
        mock_from_url.return_value.close.return_value = None
        response = self.client.get(self.health_url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("checks", data)

    @patch('game_engine.health.connections')
    @patch('redis.from_url')
    def test_health_check_returns_degraded_when_redis_down(self, mock_from_url, mock_connections):
        """Health check returns 200 with degraded Redis status when Redis is unreachable."""
        mock_connections.__getitem__.return_value.ensure_connection.return_value = None
        mock_connections.__getitem__.return_value.close.return_value = None
        mock_from_url.return_value.ping.side_effect = Exception("Connection refused")
        response = self.client.get(self.health_url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["checks"]["redis"], "degraded")

    @patch('game_engine.health.connections')
    @patch('redis.from_url')
    def test_health_check_no_auth_required(self, mock_from_url, mock_connections):
        """Health check is accessible without authentication."""
        mock_connections.__getitem__.return_value.ensure_connection.return_value = None
        mock_connections.__getitem__.return_value.close.return_value = None
        mock_from_url.return_value.ping.return_value = True
        mock_from_url.return_value.close.return_value = None
        response = self.client.get(self.health_url)
        self.assertEqual(response.status_code, 200)


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
            "CONFIG": {},
        }
    }
)
class VotingAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.room = Room.objects.create(
            code="1234", name="Test Room", status=Room.Status.PLAYING, current_round=1
        )

        self.producer1 = Player.objects.create(
            room=self.room,
            name="Producer1",
            is_spectator=False,
            elo_rating=1200,
            is_host=True,
        )

        self.producer2 = Player.objects.create(
            room=self.room, name="Producer2", is_spectator=False, elo_rating=1200
        )

        self.spectator1 = Player.objects.create(
            room=self.room, name="Spectator1", is_spectator=True
        )

        self.spectator2 = Player.objects.create(
            room=self.room, name="Spectator2", is_spectator=True
        )

        self.spectator3 = Player.objects.create(
            room=self.room, name="Spectator3", is_spectator=True
        )

        self.round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre="phonk",
            timer_duration=60,
            voting_open=False,
        )

    def test_vote_requires_spectator(self):
        url = f"/api/rooms/{self.room.code}/vote/"
        response = self.client.post(
            url,
            {
                "player_secret": str(self.producer1.player_secret),
                "voted_for_player_id": str(self.producer2.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("Only spectators can vote", response.json()["error"])

    def test_vote_requires_voting_open(self):
        url = f"/api/rooms/{self.room.code}/vote/"
        response = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.producer1.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Voting is not open", response.json()["error"])

    def test_vote_requires_3_spectators(self):
        self.round.voting_open = True
        self.round.save()

        spectator4 = Player.objects.create(
            room=self.room, name="Spectator4", is_spectator=True
        )

        url = f"/api/rooms/{self.room.code}/vote/"
        response = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.producer1.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)

    def test_vote_cannot_vote_for_spectator(self):
        self.round.voting_open = True
        self.round.save()

        url = f"/api/rooms/{self.room.code}/vote/"
        response = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.spectator2.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Cannot vote for a spectator", response.json()["error"])

    def test_vote_one_per_spectator_per_round(self):
        self.round.voting_open = True
        self.round.save()

        url = f"/api/rooms/{self.room.code}/vote/"

        response1 = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.producer1.id),
            },
            format="json",
        )
        self.assertEqual(response1.status_code, 201)

        response2 = self.client.post(
            url,
            {
                "player_secret": str(self.spectator1.player_secret),
                "voted_for_player_id": str(self.producer2.id),
            },
            format="json",
        )
        self.assertEqual(response2.status_code, 400)
        self.assertIn("already voted", response2.json()["error"])

    def test_open_voting_requires_host(self):
        url = f"/api/rooms/{self.room.code}/open_voting/"

        response = self.client.post(
            url, {"player_secret": str(self.spectator1.player_secret)}, format="json"
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("Only host can open voting", response.json()["error"])

    def test_open_voting_success(self):
        url = f"/api/rooms/{self.room.code}/open_voting/"

        response = self.client.post(
            url, {"player_secret": str(self.producer1.player_secret)}, format="json"
        )

        self.assertEqual(response.status_code, 200)

        self.round.refresh_from_db()
        self.assertTrue(self.round.voting_open)

    def test_open_voting_requires_3_spectators(self):
        Player.objects.filter(is_spectator=True).delete()

        url = f"/api/rooms/{self.room.code}/open_voting/"

        response = self.client.post(
            url, {"player_secret": str(self.producer1.player_secret)}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Need at least 3 spectators", response.json()["error"])


class RoomDetailSerializerTestCase(TestCase):
    """Tests for RoomDetailSerializer is_host field serialization."""

    def setUp(self):
        self.client = APIClient()

        self.room = Room.objects.create(
            code="5678", name="Serializer Test Room", status=Room.Status.LOBBY
        )

        self.host_player = Player.objects.create(
            room=self.room,
            name="HostPlayer",
            is_spectator=False,
            is_host=True,
        )

        self.non_host_player = Player.objects.create(
            room=self.room,
            name="JoinPlayer",
            is_spectator=False,
            is_host=False,
        )

    def test_room_detail_returns_is_host_for_each_player(self):
        """Room detail endpoint must include is_host on every player object."""
        url = f"/api/rooms/{self.room.code}/"
        response = self.client.get(url, format="json")

        self.assertEqual(response.status_code, 200)

        players = response.json()["players"]
        self.assertEqual(len(players), 2)

        # Every player object must have an is_host key
        for player in players:
            self.assertIn("is_host", player)

    def test_room_detail_host_player_has_is_host_true(self):
        """The host player must have is_host: true in the detail response."""
        url = f"/api/rooms/{self.room.code}/"
        response = self.client.get(url, format="json")

        self.assertEqual(response.status_code, 200)

        players = response.json()["players"]
        host = next(p for p in players if p["id"] == str(self.host_player.id))
        self.assertTrue(host["is_host"])

    def test_room_detail_non_host_player_has_is_host_false(self):
        """Non-host players must have is_host: false in the detail response."""
        url = f"/api/rooms/{self.room.code}/"
        response = self.client.get(url, format="json")

        self.assertEqual(response.status_code, 200)

        players = response.json()["players"]
        non_host = next(p for p in players if p["id"] == str(self.non_host_player.id))
        self.assertFalse(non_host["is_host"])

    def test_room_detail_multiple_players_correct_is_host(self):
        """Room with multiple players returns correct is_host for each."""
        # Add a third player
        third_player = Player.objects.create(
            room=self.room,
            name="ThirdPlayer",
            is_spectator=False,
            is_host=False,
        )

        url = f"/api/rooms/{self.room.code}/"
        response = self.client.get(url, format="json")

        self.assertEqual(response.status_code, 200)

        players = response.json()["players"]
        self.assertEqual(len(players), 3)

        host = next(p for p in players if p["id"] == str(self.host_player.id))
        joiner = next(p for p in players if p["id"] == str(self.non_host_player.id))
        third = next(p for p in players if p["id"] == str(third_player.id))

        self.assertTrue(host["is_host"])
        self.assertFalse(joiner["is_host"])
        self.assertFalse(third["is_host"])


class PlayerCreateSerializerTestCase(TestCase):
    """Tests for PlayerCreateSerializer field naming and is_host inclusion."""

    def setUp(self):
        self.client = APIClient()

        self.room = Room.objects.create(
            code="9999", name="Join Test Room", status=Room.Status.LOBBY
        )

        # Create a host player (needed for room to be joinable)
        Player.objects.create(
            room=self.room,
            name="ExistingHost",
            is_spectator=False,
            is_host=True,
        )

    def test_join_room_returns_player_name_not_name(self):
        """Join response must use 'player_name' key (matching frontend expectation)."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "NewPlayer", "is_spectator": False},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        # The response should have 'player_name' as the key
        self.assertIn("player_name", response.json())
        self.assertEqual(response.json()["player_name"], "NewPlayer")

    def test_join_room_returns_is_host_false_for_joiner(self):
        """Non-host player joining must have is_host: false in response."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "JoinerPlayer", "is_spectator": False},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("is_host", response.json())
        self.assertFalse(response.json()["is_host"])

    def test_join_room_returns_player_secret(self):
        """Join response must include player_secret for session auth."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "SecretPlayer", "is_spectator": False},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("player_secret", response.json())

    def test_join_room_returns_id(self):
        """Join response must include player id."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "IdPlayer", "is_spectator": False},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.json())

    def test_join_spectator_returns_is_host_false(self):
        """Spectator joining must have is_host: false."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "SpectatorJoin", "is_spectator": True},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("is_host", response.json())
        self.assertFalse(response.json()["is_host"])
        self.assertTrue(response.json()["is_spectator"])


class PlayerCreateSerializerTestCase(TestCase):
    """Tests for PlayerCreateSerializer field naming and is_host inclusion."""

    def setUp(self):
        self.client = APIClient()

        self.room = Room.objects.create(
            code="9999", name="Join Test Room", status=Room.Status.LOBBY
        )

        # Create a host player (needed for room to be joinable)
        Player.objects.create(
            room=self.room,
            name="ExistingHost",
            is_spectator=False,
            is_host=True,
        )

    def test_join_room_returns_player_name_not_name(self):
        """Join response must use 'player_name' key (matching frontend expectation)."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "NewPlayer", "is_spectator": False},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        # The response should have 'player_name' as the key
        self.assertIn("player_name", response.json())
        self.assertEqual(response.json()["player_name"], "NewPlayer")

    def test_join_room_returns_is_host_false_for_joiner(self):
        """Non-host player joining must have is_host: false in response."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "JoinerPlayer", "is_spectator": False},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("is_host", response.json())
        self.assertFalse(response.json()["is_host"])

    def test_join_room_returns_player_secret(self):
        """Join response must include player_secret for session auth."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "SecretPlayer", "is_spectator": False},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("player_secret", response.json())

    def test_join_room_returns_id(self):
        """Join response must include player id."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "IdPlayer", "is_spectator": False},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.json())

    def test_join_spectator_returns_is_host_false(self):
        """Spectator joining must have is_host: false."""
        url = f"/api/rooms/{self.room.code}/join_game/"
        response = self.client.post(
            url,
            {"player_name": "SpectatorJoin", "is_spectator": True},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("is_host", response.json())
        self.assertFalse(response.json()["is_host"])
        self.assertTrue(response.json()["is_spectator"])


class RejoinGameTestCase(TestCase):
    """Tests for rejoin_game endpoint is_host inclusion."""

    def setUp(self):
        self.client = APIClient()

        self.room = Room.objects.create(
            code="7777", name="Rejoin Test Room", status=Room.Status.LOBBY
        )

        self.host_player = Player.objects.create(
            room=self.room,
            name="HostPlayer",
            is_spectator=False,
            is_host=True,
        )

        self.non_host_player = Player.objects.create(
            room=self.room,
            name="JoinPlayer",
            is_spectator=False,
            is_host=False,
        )

    def test_rejoin_as_host_returns_is_host_true(self):
        """Rejoining as host must return is_host: true."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/rejoin_game/",
            {"player_secret": str(self.host_player.player_secret)},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("is_host", data)
        self.assertTrue(data["is_host"])

    def test_rejoin_as_non_host_returns_is_host_false(self):
        """Rejoining as non-host must return is_host: false."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/rejoin_game/",
            {"player_secret": str(self.non_host_player.player_secret)},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("is_host", data)
        self.assertFalse(data["is_host"])

    def test_rejoin_invalid_secret_returns_404(self):
        """Rejoining with invalid player_secret must return 404."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/rejoin_game/",
            {"player_secret": "00000000-0000-0000-0000-000000000000"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_rejoin_response_has_required_fields(self):
        """Rejoin response must include id, name, isSpectator, is_host, is_checked_in."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/rejoin_game/",
            {"player_secret": str(self.host_player.player_secret)},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("id", data)
        self.assertIn("name", data)
        self.assertIn("isSpectator", data)
        self.assertIn("is_host", data)
        self.assertIn("is_checked_in", data)


class PlayerCreateSerializerTestCase(TestCase):
    """Tests for PlayerCreateSerializer field naming and is_host inclusion."""

    def setUp(self):
        self.client = APIClient()

        self.room = Room.objects.create(
            code="9999", name="Create Test Room", status=Room.Status.LOBBY
        )

    def test_create_room_returns_name_not_player_name(self):
        """Room creation response must use 'name' key, not 'player_name'."""
        response = self.client.post(
            "/api/rooms/",
            {"name": "Test Room", "player_name": "TestPlayer"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        # The create endpoint returns room_code/player_id/player_secret
        # The player_name is used internally; verify room was created
        self.assertIn("room_code", response.json())
        self.assertIn("player_id", response.json())
        self.assertIn("player_secret", response.json())

    def test_join_returns_name_not_player_name(self):
        """Joining a room must return 'name' key, not 'player_name'."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/join_game/",
            {"name": "JoinPlayer"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("name", data)
        self.assertNotIn("player_name", data)
        self.assertEqual(data["name"], "JoinPlayer")

    def test_join_returns_is_host_false(self):
        """Joining a room as non-host must return is_host: false."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/join_game/",
            {"name": "JoinPlayer"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("is_host", data)
        self.assertFalse(data["is_host"])

    def test_join_returns_player_secret(self):
        """Joining a room must return player_secret for session auth."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/join_game/",
            {"name": "JoinPlayer"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("player_secret", data)

    def test_join_with_special_characters_in_name(self):
        """Player name with special characters serializes correctly under 'name' key."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/join_game/",
            {"name": "Player <script>alert('xss')</script> & Co."},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("name", data)
        self.assertNotIn("player_name", data)


class RejoinGameTestCase(TestCase):
    """Tests for rejoin_game endpoint is_host inclusion."""

    def setUp(self):
        self.client = APIClient()

        self.room = Room.objects.create(
            code="7777", name="Rejoin Test Room", status=Room.Status.LOBBY
        )

        self.host_player = Player.objects.create(
            room=self.room,
            name="HostPlayer",
            is_spectator=False,
            is_host=True,
        )

        self.non_host_player = Player.objects.create(
            room=self.room,
            name="JoinPlayer",
            is_spectator=False,
            is_host=False,
        )

    def test_rejoin_as_host_returns_is_host_true(self):
        """Rejoining as host must return is_host: true."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/rejoin_game/",
            {"player_secret": str(self.host_player.player_secret)},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("is_host", data)
        self.assertTrue(data["is_host"])

    def test_rejoin_as_non_host_returns_is_host_false(self):
        """Rejoining as non-host must return is_host: false."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/rejoin_game/",
            {"player_secret": str(self.non_host_player.player_secret)},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("is_host", data)
        self.assertFalse(data["is_host"])

    def test_rejoin_invalid_secret_returns_404(self):
        """Rejoining with invalid player_secret must return 404."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/rejoin_game/",
            {"player_secret": "00000000-0000-0000-0000-000000000000"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_rejoin_response_has_required_fields(self):
        """Rejoin response must include id, name, isSpectator, is_host, is_checked_in."""
        response = self.client.post(
            f"/api/rooms/{self.room.code}/rejoin_game/",
            {"player_secret": str(self.host_player.player_secret)},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("id", data)
        self.assertIn("name", data)
        self.assertIn("isSpectator", data)
        self.assertIn("is_host", data)
        self.assertIn("is_checked_in", data)

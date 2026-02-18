from django.test import TestCase
from rest_framework.test import APIClient
from .models import Room, Player, Round, Vote


class GameEngineBasicTestCase(TestCase):
    def test_django_test_framework_works(self):
        self.assertTrue(True)


class VotingAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.room = Room.objects.create(
            code="1234", name="Test Room", status=Room.Status.PLAYING, current_round=1
        )

        self.producer1 = Player.objects.create(
            room=self.room, name="Producer1", is_spectator=False, elo_rating=1200
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

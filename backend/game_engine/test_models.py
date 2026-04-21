import uuid
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.db.utils import IntegrityError
from .models import Room, Player, Tile, Round, Vote


class RoomModelTestCase(TestCase):
    def test_room_creation(self):
        """Test basic room creation with default values"""
        room = Room.objects.create(name="Test Room")
        self.assertEqual(room.name, "Test Room")
        self.assertEqual(room.status, Room.Status.LOBBY)
        self.assertEqual(room.current_round, 1)
        self.assertIsNone(room.winner)
        self.assertIsNotNone(room.id)
        self.assertIsNotNone(room.created_at)
        self.assertIsNotNone(room.updated_at)

    def test_room_code_generation(self):
        """Test that room codes are properly generated"""
        room = Room.objects.create(name="Test Room", code="1234")
        # Room code should be set when provided
        self.assertEqual(room.code, "1234")
        self.assertEqual(len(room.code), 4)
        self.assertTrue(room.code.isdigit())

    def test_room_status_choices(self):
        """Test room status field choices"""
        room = Room.objects.create(name="Test Room", code="5678")
        
        # Test default status
        self.assertEqual(room.status, Room.Status.LOBBY)
        
        # Test status changes
        room.status = Room.Status.PLAYING
        room.save()
        self.assertEqual(room.status, Room.Status.PLAYING)
        
        room.status = Room.Status.FINISHED
        room.save()
        self.assertEqual(room.status, Room.Status.FINISHED)

    def test_room_host_property(self):
        """Test the host property returns the correct player"""
        room = Room.objects.create(name="Test Room")
        
        # No players yet
        self.assertIsNone(room.host)
        
        # Add host player
        host = Player.objects.create(
            room=room,
            name="HostPlayer",
            is_host=True,
            is_spectator=False
        )
        
        # Add spectator
        spectator = Player.objects.create(
            room=room,
            name="Spectator",
            is_host=False,
            is_spectator=True
        )
        
        # Host should be the host player
        self.assertEqual(room.host, host)

    def test_room_str_representation(self):
        """Test room string representation"""
        room = Room.objects.create(name="Test Room", code="1234")
        expected = "Room 1234 (lobby)"
        self.assertEqual(str(room), expected)


class PlayerModelTestCase(TestCase):
    def setUp(self):
        self.room = Room.objects.create(name="Test Room", code="2222")

    def test_player_creation(self):
        """Test basic player creation"""
        player = Player.objects.create(
            room=self.room,
            name="TestPlayer",
            is_spectator=False,
            is_host=True
        )
        
        self.assertEqual(player.name, "TestPlayer")
        self.assertEqual(player.room, self.room)
        self.assertFalse(player.is_spectator)
        self.assertTrue(player.is_host)
        self.assertFalse(player.is_connected)
        self.assertEqual(player.elo_rating, 1200)  # Default value
        self.assertEqual(player.elo_wins, 0)
        self.assertEqual(player.elo_losses, 0)
        self.assertEqual(player.elo_matches, 0)
        self.assertIsNotNone(player.player_secret)
        self.assertIsNotNone(player.id)

    def test_player_unique_name_per_room(self):
        """Test that player names must be unique within a room"""
        Player.objects.create(
            room=self.room,
            name="DuplicateName",
            is_spectator=False
        )
        
        # Creating another player with same name in same room should fail
        with self.assertRaises(IntegrityError):
            Player.objects.create(
                room=self.room,
                name="DuplicateName",
                is_spectator=False
            )

    def test_player_same_name_different_rooms(self):
        """Test that same name can be used in different rooms"""
        room2 = Room.objects.create(name="Test Room 2", code="3333")
        
        player1 = Player.objects.create(
            room=self.room,
            name="SameName",
            is_spectator=False
        )
        
        player2 = Player.objects.create(
            room=room2,
            name="SameName",
            is_spectator=False
        )
        
        # Both should exist successfully
        self.assertEqual(Player.objects.filter(name="SameName").count(), 2)

    def test_player_elo_fields(self):
        """Test ELO rating fields"""
        player = Player.objects.create(
            room=self.room,
            name="TestPlayer",
            elo_rating=1500,
            elo_wins=10,
            elo_losses=5,
            elo_matches=15
        )
        
        self.assertEqual(player.elo_rating, 1500)
        self.assertEqual(player.elo_wins, 10)
        self.assertEqual(player.elo_losses, 5)
        self.assertEqual(player.elo_matches, 15)

    def test_player_str_representation(self):
        """Test player string representation"""
        player = Player.objects.create(
            room=self.room,
            name="TestPlayer"
        )
        expected = f"TestPlayer in {self.room.id}"
        self.assertEqual(str(player), expected)


class TileModelTestCase(TestCase):
    def setUp(self):
        self.room = Room.objects.create(name="Test Room", code="4444")
        self.player = Player.objects.create(
            room=self.room,
            name="TestPlayer",
            is_spectator=False
        )

    def test_tile_creation(self):
        """Test basic tile creation"""
        tile = Tile.objects.create(
            player=self.player,
            room=self.room,
            genre=Tile.Genre.PHONK,
            position=1
        )
        
        self.assertEqual(tile.player, self.player)
        self.assertEqual(tile.room, self.room)
        self.assertEqual(tile.genre, Tile.Genre.PHONK)
        self.assertEqual(tile.status, Tile.Status.EMPTY)
        self.assertEqual(tile.position, 1)
        self.assertFalse(tile.audio_file)  # FileField is False when empty
        self.assertIsNone(tile.audio_url)

    def test_tile_genre_choices(self):
        """Test all tile genre choices"""
        genres = [
            Tile.Genre.PHONK,
            Tile.Genre.TRAP,
            Tile.Genre.LOFI,
            Tile.Genre.HOUSE,
            Tile.Genre.DRILL,
            Tile.Genre.RNB,
            Tile.Genre.EDM,
            Tile.Genre.JAZZ,
            Tile.Genre.AMBIENT
        ]
        
        created_tiles = []
        for i, genre in enumerate(genres):
            tile = Tile.objects.create(
                player=self.player,
                room=self.room,
                genre=genre,
                position=i
            )
            created_tiles.append(tile)
        
        # Verify all genres were saved correctly
        for tile, expected_genre in zip(created_tiles, genres):
            self.assertEqual(tile.genre, expected_genre)

    def test_tile_status_transitions(self):
        """Test tile status field transitions"""
        tile = Tile.objects.create(
            player=self.player,
            room=self.room,
            genre=Tile.Genre.PHONK,
            position=1
        )
        
        # Default status should be EMPTY
        self.assertEqual(tile.status, Tile.Status.EMPTY)
        
        # Transition to PENDING
        tile.status = Tile.Status.PENDING
        tile.save()
        self.assertEqual(tile.status, Tile.Status.PENDING)
        
        # Transition to COMPLETE
        tile.status = Tile.Status.COMPLETE
        tile.save()
        self.assertEqual(tile.status, Tile.Status.COMPLETE)

    def test_tile_unique_position_per_player_per_room(self):
        """Test that tile positions are unique per player per room"""
        Tile.objects.create(
            player=self.player,
            room=self.room,
            genre=Tile.Genre.PHONK,
            position=1
        )
        
        # Creating another tile with same position for same player should fail
        with self.assertRaises(IntegrityError):
            Tile.objects.create(
                player=self.player,
                room=self.room,
                genre=Tile.Genre.TRAP,
                position=1
            )

    def test_tile_different_players_same_position(self):
        """Test that different players can have tiles in same position"""
        player2 = Player.objects.create(
            room=self.room,
            name="Player2",
            is_spectator=False
        )
        
        tile1 = Tile.objects.create(
            player=self.player,
            room=self.room,
            genre=Tile.Genre.PHONK,
            position=1
        )
        
        tile2 = Tile.objects.create(
            player=player2,
            room=self.room,
            genre=Tile.Genre.TRAP,
            position=1
        )
        
        # Both should exist successfully
        self.assertEqual(Tile.objects.filter(position=1).count(), 2)

    def test_tile_str_representation(self):
        """Test tile string representation"""
        tile = Tile.objects.create(
            player=self.player,
            room=self.room,
            genre=Tile.Genre.PHONK,
            position=1,
            status=Tile.Status.COMPLETE
        )
        expected = f"{self.player.name}'s phonk tile (complete)"
        self.assertEqual(str(tile), expected)


class RoundModelTestCase(TestCase):
    def setUp(self):
        self.room = Room.objects.create(name="Test Room", code="5555")

    def test_round_creation(self):
        """Test basic round creation"""
        round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK,
            timer_duration=60
        )
        
        self.assertEqual(round.room, self.room)
        self.assertEqual(round.round_number, 1)
        self.assertEqual(round.current_tile_genre, Tile.Genre.PHONK)
        self.assertEqual(round.timer_duration, 60)
        self.assertFalse(round.voting_open)
        self.assertEqual(round.votes_recorded, 0)
        self.assertIsNone(round.winner)
        self.assertIsNone(round.timer_started_at)
        self.assertIsNone(round.timer_ends_at)

    def test_round_unique_per_room(self):
        """Test that round numbers are unique per room"""
        Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK
        )
        
        # Creating another round with same number for same room should fail
        with self.assertRaises(IntegrityError):
            Round.objects.create(
                room=self.room,
                round_number=1,
                current_tile_genre=Tile.Genre.TRAP
            )

    def test_round_different_rooms_same_number(self):
        """Test that same round number can be used in different rooms"""
        room2 = Room.objects.create(name="Test Room 2", code="6666")
        
        round1 = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK
        )
        
        round2 = Round.objects.create(
            room=room2,
            round_number=1,
            current_tile_genre=Tile.Genre.TRAP
        )
        
        # Both should exist successfully
        self.assertEqual(Round.objects.filter(round_number=1).count(), 2)

    def test_round_timer_state(self):
        """Test round timer state management"""
        round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK,
            timer_duration=120
        )
        
        # Initially no timer state
        self.assertIsNone(round.timer_started_at)
        self.assertIsNone(round.timer_ends_at)
        
        # Set timer state
        from django.utils import timezone
        start_time = timezone.now()
        round.timer_started_at = start_time
        round.timer_ends_at = start_time + timezone.timedelta(seconds=120)
        round.save()
        
        # Verify timer state
        self.assertIsNotNone(round.timer_started_at)
        self.assertIsNotNone(round.timer_ends_at)

    def test_round_voting_state(self):
        """Test round voting state management"""
        round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK
        )
        
        # Initially voting is closed
        self.assertFalse(round.voting_open)
        self.assertEqual(round.votes_recorded, 0)
        
        # Open voting
        round.voting_open = True
        round.votes_recorded = 3
        round.save()
        
        # Verify voting state
        self.assertTrue(round.voting_open)
        self.assertEqual(round.votes_recorded, 3)

    def test_round_str_representation(self):
        """Test round string representation"""
        room = Room.objects.create(name="Test Room", code="1234")
        round = Round.objects.create(
            room=room,
            round_number=2,
            current_tile_genre=Tile.Genre.PHONK
        )
        expected = "Round 2 in 1234 (phonk)"
        self.assertEqual(str(round), expected)


class VoteModelTestCase(TestCase):
    def setUp(self):
        self.room = Room.objects.create(name="Test Room", code="7777")
        self.round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK
        )
        self.voter = Player.objects.create(
            room=self.room,
            name="Voter",
            is_spectator=True
        )
        self.producer = Player.objects.create(
            room=self.room,
            name="Producer",
            is_spectator=False
        )

    def test_vote_creation(self):
        """Test basic vote creation"""
        vote = Vote.objects.create(
            round=self.round,
            voter=self.voter,
            voted_for=self.producer
        )
        
        self.assertEqual(vote.round, self.round)
        self.assertEqual(vote.voter, self.voter)
        self.assertEqual(vote.voted_for, self.producer)
        self.assertIsNotNone(vote.id)
        self.assertIsNotNone(vote.created_at)

    def test_vote_unique_per_round_per_voter(self):
        """Test that votes are unique per round per voter"""
        Vote.objects.create(
            round=self.round,
            voter=self.voter,
            voted_for=self.producer
        )
        
        # Creating another vote by same voter in same round should fail
        with self.assertRaises(IntegrityError):
            Vote.objects.create(
                round=self.round,
                voter=self.voter,
                voted_for=self.producer
            )

    def test_vote_different_rounds_same_voter(self):
        """Test that same voter can vote in different rounds"""
        round2 = Round.objects.create(
            room=self.room,
            round_number=2,
            current_tile_genre=Tile.Genre.TRAP
        )
        
        vote1 = Vote.objects.create(
            round=self.round,
            voter=self.voter,
            voted_for=self.producer
        )
        
        vote2 = Vote.objects.create(
            round=round2,
            voter=self.voter,
            voted_for=self.producer
        )
        
        # Both should exist successfully
        self.assertEqual(Vote.objects.filter(voter=self.voter).count(), 2)

    def test_vote_str_representation(self):
        """Test vote string representation"""
        vote = Vote.objects.create(
            round=self.round,
            voter=self.voter,
            voted_for=self.producer
        )
        expected = f"{self.voter.name} voted for {self.producer.name} in Round 1"
        self.assertEqual(str(vote), expected)


class ModelRelationshipsTestCase(TestCase):
    """Test model relationships and cascading behavior"""

    def setUp(self):
        self.room = Room.objects.create(name="Test Room", code="8888")
        self.host = Player.objects.create(
            room=self.room,
            name="Host",
            is_host=True,
            is_spectator=False
        )
        self.spectator = Player.objects.create(
            room=self.room,
            name="Spectator",
            is_host=False,
            is_spectator=True
        )
        self.round = Round.objects.create(
            room=self.room,
            round_number=1,
            current_tile_genre=Tile.Genre.PHONK
        )

    def test_room_player_relationship(self):
        """Test room-player relationship"""
        # Room should have related players
        self.assertEqual(self.room.players.count(), 2)
        self.assertIn(self.host, self.room.players.all())
        self.assertIn(self.spectator, self.room.players.all())

    def test_room_round_relationship(self):
        """Test room-round relationship"""
        # Room should have related rounds
        self.assertEqual(self.room.rounds.count(), 1)
        self.assertIn(self.round, self.room.rounds.all())

    def test_player_tile_relationship(self):
        """Test player-tile relationship"""
        tile = Tile.objects.create(
            player=self.host,
            room=self.room,
            genre=Tile.Genre.PHONK,
            position=1
        )
        
        # Player should have related tiles
        self.assertEqual(self.host.tiles.count(), 1)
        self.assertIn(tile, self.host.tiles.all())

    def test_round_vote_relationship(self):
        """Test round-vote relationship"""
        vote = Vote.objects.create(
            round=self.round,
            voter=self.spectator,
            voted_for=self.host
        )
        
        # Round should have related votes
        self.assertEqual(self.round.votes.count(), 1)
        self.assertIn(vote, self.round.votes.all())

    def test_cascade_delete_room(self):
        """Test that deleting a room cascades to related objects"""
        # Create related objects
        tile = Tile.objects.create(
            player=self.host,
            room=self.room,
            genre=Tile.Genre.PHONK,
            position=1
        )
        vote = Vote.objects.create(
            round=self.round,
            voter=self.spectator,
            voted_for=self.host
        )
        
        # Verify objects exist
        self.assertEqual(Room.objects.count(), 1)
        self.assertEqual(Player.objects.count(), 2)
        self.assertEqual(Round.objects.count(), 1)
        self.assertEqual(Tile.objects.count(), 1)
        self.assertEqual(Vote.objects.count(), 1)
        
        # Delete room
        self.room.delete()
        
        # Verify cascading deletion
        self.assertEqual(Room.objects.count(), 0)
        self.assertEqual(Player.objects.count(), 0)  # Players cascade delete
        self.assertEqual(Round.objects.count(), 0)  # Rounds cascade delete
        self.assertEqual(Tile.objects.count(), 0)  # Tiles cascade delete
        self.assertEqual(Vote.objects.count(), 0)  # Votes cascade delete

    def test_room_winner_relationship(self):
        """Test room-winner relationship"""
        # Set room winner
        self.room.winner = self.host
        self.room.save()
        
        # Verify relationship
        self.assertEqual(self.room.winner, self.host)
        self.assertIn(self.room, self.host.won_rooms.all())

    def test_round_winner_relationship(self):
        """Test round-winner relationship"""
        # Set round winner
        self.round.winner = self.host
        self.round.save()
        
        # Verify relationship
        self.assertEqual(self.round.winner, self.host)
        self.assertIn(self.round, self.host.won_rounds.all())

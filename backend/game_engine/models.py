import uuid
import random
from django.db import models
from django.core.validators import FileExtensionValidator
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # type: ignore  # Disable Django's type checking for this file to avoid false positives with custom model imports
    from django.db.models import (
        UUIDField,
        CharField,
        PositiveIntegerField,
        ForeignKey,
        BooleanField,
        DateTimeField,
        TextChoices,
        FileField,
        URLField,
        ManyToManyField,
    )
    from django.core.validators import FileExtensionValidator
else:
    from django.db.models import (
        UUIDField,
        CharField,
        PositiveIntegerField,
        ForeignKey,
        BooleanField,
        DateTimeField,
        TextChoices,
        FileField,
        URLField,
        ManyToManyField,
    )


class Room(models.Model):
    class Status(models.TextChoices):
        LOBBY = "lobby", "Lobby"
        PLAYING = "playing", "Playing"
        FINISHED = "finished", "Finished"

    class Theme(models.TextChoices):
        CLASSIC = "classic", "Classic"
        PHONK = "phonk", "Phonk"
        TRAP = "trap", "Trap"
        LOFI = "lofi", "Lo-Fi"
        HOUSE = "house", "House"
        ELECTRONIC = "electronic", "Electronic"
        CUSTOM = "custom", "Custom"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(
        max_length=4, unique=True, blank=True, default=""
    )  # 4-digit room code
    name = models.CharField(max_length=100, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.LOBBY
    )
    current_round = models.PositiveIntegerField(default=1)
    total_rounds = models.PositiveIntegerField(default=10)
    theme = models.CharField(
        max_length=20, choices=Theme.choices, default=Theme.CLASSIC, blank=True
    )
    custom_genres = models.JSONField(default=list, blank=True)  # Array of genre strings
    bonus_multiplier = models.DecimalField(
        max_digits=3, decimal_places=2, default=1.00
    )
    winner = models.ForeignKey(
        "Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="won_rooms",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Room {self.code or self.id} ({self.status})"

    @property
    def host(self):
        return self.players.filter(is_host=True, is_spectator=False).first()


class Player(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player_secret = models.UUIDField(
        default=uuid.uuid4, editable=False
    )  # Secret for reconnection
    name = models.CharField(max_length=50)
    avatar = models.URLField(blank=True, null=True)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="players")
    is_spectator = models.BooleanField(default=False)
    is_host = models.BooleanField(default=False)
    is_connected = models.BooleanField(default=False)  # Presence tracking
    joined_at = models.DateTimeField(auto_now_add=True)

    # ELO Rating fields
    elo_rating = models.PositiveIntegerField(default=1200)  # Starting ELO
    elo_wins = models.PositiveIntegerField(default=0)
    elo_losses = models.PositiveIntegerField(default=0)
    elo_matches = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["joined_at"]
        unique_together = ["room", "name"]  # Prevent duplicate names in same room

    def __str__(self):
        return f"{self.name} in {self.room.id}"


class Tile(models.Model):
    class Status(models.TextChoices):
        EMPTY = "empty", "Empty"
        PENDING = "pending", "Pending"
        COMPLETE = "complete", "Complete"

    class Genre(models.TextChoices):
        PHONK = "phonk", "Phonk"
        TRAP = "trap", "Trap"
        LOFI = "lofi", "Lo-Fi"
        HOUSE = "house", "House"
        DRILL = "drill", "Drill"
        RNB = "rnb", "R&B"
        EDM = "edm", "EDM"
        JAZZ = "jazz", "Jazz"
        AMBIENT = "ambient", "Ambient"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey("Player", on_delete=models.CASCADE, related_name="tiles")
    room = models.ForeignKey("Room", on_delete=models.CASCADE, related_name="tiles")
    genre = models.CharField(max_length=20, choices=Genre.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.EMPTY
    )
    position = models.PositiveSmallIntegerField()  # 0-8 for 3x3 grid
    audio_file = models.FileField(
        upload_to="audio/%Y/%m/%d/",
        blank=True,
        null=True,
        validators=[
            FileExtensionValidator(allowed_extensions=["mp3", "wav", "ogg", "m4a"])
        ],
    )
    audio_url = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position"]
        unique_together = [
            "player",
            "room",
            "position",
        ]  # Each position unique per player per room

    def __str__(self):
        return f"{self.player.name}'s {self.genre} tile ({self.status})"


class Round(models.Model):
    """Tracks the current round/turn state for a room."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="rounds")
    round_number = models.PositiveIntegerField(default=1)

    # Current tile being contested
    current_tile_genre = models.CharField(max_length=20, choices=Tile.Genre.choices)

    # Timer state (server-authoritative)
    timer_duration = models.PositiveIntegerField(default=60)  # seconds
    timer_started_at = models.DateTimeField(null=True, blank=True)
    timer_ends_at = models.DateTimeField(null=True, blank=True)

    # Voting state
    voting_open = models.BooleanField(default=False)
    votes_recorded = models.PositiveIntegerField(default=0)

    # Winner of this round
    winner = models.ForeignKey(
        Player,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="won_rounds",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-round_number"]
        unique_together = ["room", "round_number"]

    def __str__(self):
        return (
            f"Round {self.round_number} in {self.room.code} ({self.current_tile_genre})"
        )


class Vote(models.Model):
    """Tracks spectator votes for a producer's tile in a round."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    round = models.ForeignKey(Round, on_delete=models.CASCADE, related_name="votes")
    voter = models.ForeignKey(
        Player, on_delete=models.CASCADE, related_name="votes_cast"
    )

    # The producer being voted for
    voted_for = models.ForeignKey(
        Player, on_delete=models.CASCADE, related_name="votes_received"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["round", "voter"]  # One vote per round per spectator

    def __str__(self):
        return f"{self.voter.name} voted for {self.voted_for.name} in Round {self.round.round_number}"

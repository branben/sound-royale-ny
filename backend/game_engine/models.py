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
        WEEKLY = "weekly", "Weekly Rotation"
        MONTHLY = "monthly", "Monthly Rotation"
        PHONK = "phonk", "Phonk"
        TRAP = "trap", "Trap"
        LOFI = "lofi", "Lo-Fi"
        HOUSE = "house", "House"
        ELECTRONIC = "electronic", "Electronic"
        CUSTOM = "custom", "Custom"

    class MatchType(models.TextChoices):
        CASUAL = "casual", "Casual"
        RANKED = "ranked", "Ranked"

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
    match_type = models.CharField(
        max_length=10, choices=MatchType.choices, default=MatchType.CASUAL
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


class ThemeRotation(models.Model):
    class Key(models.TextChoices):
        CLASSIC = "classic", "Classic"
        WEEKLY = "weekly", "Weekly Rotation"
        MONTHLY = "monthly", "Monthly Rotation"

    key = models.CharField(max_length=20, choices=Key.choices, unique=True)
    name = models.CharField(max_length=50)
    description = models.CharField(max_length=120, default="theme by @1120cooks")
    genres = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return self.name


class Player(models.Model):
    # Link to Django auth User for JWT authentication
    user = models.OneToOneField('auth.User', related_name='player', null=True, on_delete=models.CASCADE)
    class Title(models.TextChoices):
        NONE = "NONE", "None"
        JACKPOT = "JACKPOT", "Jackpot"
        SWEEPER = "SWEEPER", "Sweeper"
        CHECKED_IN = "CHECKED_IN", "Checked In"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player_secret = models.UUIDField(
        default=uuid.uuid4, editable=False
    )  # Secret for reconnection
    name = models.CharField(max_length=50)
    avatar = models.URLField(blank=True, null=True)
    room = models.ForeignKey(
        Room, on_delete=models.CASCADE, related_name="players", null=True, blank=True
    )
    discord_identity = models.ForeignKey(
        "DiscordAccount",
        on_delete=models.SET_NULL,
        related_name="linked_players",
        blank=True,
        null=True,
    )
    is_spectator = models.BooleanField(default=False)
    is_host = models.BooleanField(default=False)
    is_connected = models.BooleanField(default=False)  # Presence tracking
    is_ready = models.BooleanField(default=False)  # Ready status for lobby
    joined_at = models.DateTimeField(auto_now_add=True)

    # ELO Rating fields
    elo_rating = models.PositiveIntegerField(default=1200)  # Starting ELO
    elo_wins = models.PositiveIntegerField(default=0)
    elo_losses = models.PositiveIntegerField(default=0)
    elo_matches = models.PositiveIntegerField(default=0)

    # Producer title flags. current_title is derived from these by priority.
    is_checked_in = models.BooleanField(default=False)
    earned_jackpot = models.BooleanField(default=False)
    earned_sweeper = models.BooleanField(default=False)

    @property
    def is_authenticated(self):
        return True

    class Meta:
        ordering = ["joined_at"]
        unique_together = ["room", "name"]  # Prevent duplicate names in same room

    def __str__(self):
        if self.room:
            return f"{self.name} in {self.room.id}"
        return f"{self.name} (no room)"

    @property
    def current_title(self):
        if self.earned_sweeper:
            return self.Title.SWEEPER
        if self.earned_jackpot:
            return self.Title.JACKPOT
        if self.is_checked_in:
            return self.Title.CHECKED_IN
        return self.Title.NONE


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
            FileExtensionValidator(allowed_extensions=["mp3", "wav", "ogg", "flac", "m4a", "aac"])
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


class DiscordAccount(models.Model):
    """Links a Sound Royale player to a Discord user account."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(
        Player, on_delete=models.CASCADE, related_name="discord_account"
    )
    session_secret = models.UUIDField(default=uuid.uuid4, editable=False)
    discord_user_id = models.CharField(max_length=255, unique=True)
    discord_username = models.CharField(max_length=255, blank=True)
    discord_avatar_url = models.TextField(blank=True, null=True)
    access_token = models.TextField(blank=True, null=True)
    refresh_token = models.TextField(blank=True, null=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    linked_at = models.DateTimeField(auto_now_add=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    privacy_settings = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ["player", "discord_user_id"]

    def __str__(self):
        return f"{self.player.name} linked to Discord {self.discord_username}"


class DiscordServer(models.Model):
    """Tracks Discord servers where the Sound Royale bot is installed."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    server_id = models.CharField(max_length=255, unique=True)
    server_name = models.CharField(max_length=255, blank=True)
    bot_added_at = models.DateTimeField(auto_now_add=True)
    settings = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Discord Server {self.server_name} ({self.server_id})"


class DiscordServerMember(models.Model):
    """Tracks Discord server member roles and ELO tiers."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    server = models.ForeignKey(
        DiscordServer, on_delete=models.CASCADE, related_name="members"
    )
    discord_account = models.ForeignKey(
        DiscordAccount, on_delete=models.CASCADE, related_name="server_memberships"
    )
    elo_tier = models.CharField(max_length=50, blank=True)
    roles = models.JSONField(default=list, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ["server", "discord_account"]

    def __str__(self):
        return f"{self.discord_account.discord_username} in {self.server.server_name}"

import uuid
import random
import secrets
from django.db import models
from django.core.validators import FileExtensionValidator
from django.utils import timezone
from django.contrib.auth.hashers import check_password, make_password
from typing import TYPE_CHECKING
from django.conf import settings
from cryptography.fernet import Fernet

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
        PHONK = "phonk", "Phonk Heavy"
        TRAP = "trap", "Trap"
        LOFI = "lofi", "Chill Vibes"
        HOUSE = "house", "Electronic"
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


class VerifiedUser(models.Model):
    """Durable verified player identity for ranked play and leaderboards."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    display_name = models.CharField(max_length=50, unique=True)
    email = models.EmailField(unique=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    elo_rating = models.PositiveIntegerField(default=1200)
    elo_wins = models.PositiveIntegerField(default=0)
    elo_losses = models.PositiveIntegerField(default=0)
    elo_matches = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-elo_rating", "display_name"]

    def __str__(self):
        return self.display_name

    def mark_seen(self):
        self.last_seen_at = timezone.now()
        self.save(update_fields=["last_seen_at"])


class EmailVerificationCode(models.Model):
    """Hashed one-time email login code."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def create_for_email(cls, email: str):
        normalized_email = email.strip().lower()
        code = f"{secrets.randbelow(1_000_000):06d}"
        cls.objects.create(
            email=normalized_email,
            code_hash=make_password(code),
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )
        return code

    def is_usable(self):
        return self.consumed_at is None and self.expires_at > timezone.now() and self.attempt_count < 5

    def verify(self, code: str):
        if not self.is_usable():
            return False
        self.attempt_count += 1
        is_match = check_password(code, self.code_hash)
        if is_match:
            self.consumed_at = timezone.now()
        self.save(update_fields=["attempt_count", "consumed_at"])
        return is_match


class Player(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player_secret = models.UUIDField(
        default=uuid.uuid4, editable=False
    )  # Secret for reconnection
    name = models.CharField(max_length=50)
    avatar = models.URLField(blank=True, null=True)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="players")
    verified_user = models.ForeignKey(
        VerifiedUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="room_players",
    )
    is_spectator = models.BooleanField(default=False)
    is_host = models.BooleanField(default=False)
    is_connected = models.BooleanField(default=False)  # Presence tracking
    is_ready = models.BooleanField(default=False)  # Lobby ready state
    joined_at = models.DateTimeField(auto_now_add=True)

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


class EloDeltaEvent(models.Model):
    """Append-only ledger of ELO rating changes for verified users."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    verified_user = models.ForeignKey(
        VerifiedUser,
        on_delete=models.CASCADE,
        related_name="elo_deltas"
    )
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="elo_deltas"
    )
    previous_elo = models.PositiveIntegerField()
    delta = models.IntegerField()  # Can be negative for losses
    new_elo = models.PositiveIntegerField()
    match_result = models.CharField(max_length=10)  # win/loss
    reason = models.CharField(max_length=50)  # round_win, round_loss, legacy_baseline
    idempotency_key = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        """Enforce append-only - updates not allowed."""
        # Check if this is an update by checking if the instance already exists in DB
        if self.pk and EloDeltaEvent.objects.filter(pk=self.pk).exists():
            raise ValueError("EloDeltaEvent is append-only - updates not allowed")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Enforce append-only - deletion not allowed."""
        raise ValueError("EloDeltaEvent is append-only - deletion not allowed")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["verified_user", "-created_at"]),
            models.Index(fields=["idempotency_key"]),
        ]

    def __str__(self):
        return f"{self.verified_user.display_name}: {self.previous_elo} → {self.new_elo} ({self.delta})"


class EloIdempotencyKey(models.Model):
    """Idempotency keys to prevent duplicate ELO delta processing."""

    key = models.CharField(max_length=100, unique=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def is_consumed(cls, key: str) -> bool:
        """Check if a key has been consumed."""
        return cls.objects.filter(key=key, consumed_at__isnull=False).exists()

    @classmethod
    def consume(cls, key: str) -> bool:
        """Mark a key as consumed. Returns True if successful, False if already consumed or expired."""
        updated = cls.objects.filter(
            key=key,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now()
        ).update(consumed_at=timezone.now())
        return updated > 0

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["key"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self):
        return f"{self.key} (consumed: {self.consumed_at is not None})"


class DiscordIdentity(models.Model):
    """Discord OAuth identity linked to verified users with encrypted tokens."""

    verified_user = models.OneToOneField(
        VerifiedUser,
        on_delete=models.CASCADE,
        related_name='discord_identity'
    )
    discord_id = models.CharField(max_length=100, unique=True)
    discord_username = models.CharField(max_length=100)
    discord_avatar = models.CharField(max_length=100, blank=True, null=True)
    access_token = models.TextField()  # Encrypted
    refresh_token = models.TextField()  # Encrypted
    token_expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def _get_fernet(self):
        """Get Fernet instance for encryption/decryption."""
        key = getattr(settings, 'FERNET_KEY', None)
        if not key:
            raise ValueError("FERNET_KEY must be set in settings")
        return Fernet(key.encode() if isinstance(key, str) else key)

    def set_tokens(self, access_token, refresh_token):
        """Encrypt and store Discord tokens."""
        fernet = self._get_fernet()
        self.access_token = fernet.encrypt(access_token.encode()).decode()
        self.refresh_token = fernet.encrypt(refresh_token.encode()).decode()

    def get_access_token(self):
        """Decrypt and return access token."""
        fernet = self._get_fernet()
        return fernet.decrypt(self.access_token.encode()).decode()

    def get_refresh_token(self):
        """Decrypt and return refresh token."""
        fernet = self._get_fernet()
        return fernet.decrypt(self.refresh_token.encode()).decode()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["discord_id"]),
        ]

    def __str__(self):
        return f"{self.discord_username} ({self.discord_id})"

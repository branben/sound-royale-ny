import os
import requests
import json
import base64
import logging
from datetime import timedelta
from cryptography.fernet import Fernet
from django.conf import settings
from django.utils import timezone
from decouple import config
from .models import DiscordAccount, Player

logger = logging.getLogger(__name__)

# Discord API endpoints
DISCORD_API_BASE = "https://discord.com/api/v10"
DISCORD_TOKEN_URL = f"{DISCORD_API_BASE}/oauth2/token"
DISCORD_USER_URL = f"{DISCORD_API_BASE}/users/@me"

# OAuth configuration
DISCORD_CLIENT_ID = config("DISCORD_CLIENT_ID", default="")
DISCORD_CLIENT_SECRET = config("DISCORD_CLIENT_SECRET", default="")
DISCORD_REDIRECT_URI = config("DISCORD_REDIRECT_URI", default="http://localhost:8000/api/auth/discord/callback")

# Generate or load encryption key for token storage
DISCORD_ENCRYPTION_KEY = os.getenv("DISCORD_ENCRYPTION_KEY", "")
if not DISCORD_ENCRYPTION_KEY:
    # Generate a key if not set (for development only)
    DISCORD_ENCRYPTION_KEY = Fernet.generate_key().decode()
    logger.warning(
        "DISCORD_ENCRYPTION_KEY is not configured; using an ephemeral development key"
    )


class DiscordOAuthService:
    """Service for handling Discord OAuth2 flow and token management."""

    def __init__(self):
        # Initialize encryption for token storage
        self.fernet = Fernet(DISCORD_ENCRYPTION_KEY.encode())

    def get_authorization_url(self, state: str) -> str:
        """Generate the Discord OAuth2 authorization URL."""
        params = {
            "client_id": DISCORD_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": DISCORD_REDIRECT_URI,
            "scope": "identify email guilds",
            "state": state,
        }
        url = f"https://discord.com/oauth2/authorize?"
        url += "&".join(f"{k}={v}" for k, v in params.items())
        return url

    def exchange_code_for_token(self, code: str) -> dict:
        """Exchange OAuth authorization code for access token."""
        data = {
            "client_id": DISCORD_CLIENT_ID,
            "client_secret": DISCORD_CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": DISCORD_REDIRECT_URI,
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        response = requests.post(DISCORD_TOKEN_URL, data=data, headers=headers)
        response.raise_for_status()
        return response.json()

    def get_user_info(self, access_token: str) -> dict:
        """Get Discord user information using access token."""
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.get(DISCORD_USER_URL, headers=headers)
        response.raise_for_status()
        return response.json()

    def refresh_access_token(self, refresh_token: str) -> dict:
        """Refresh an expired access token."""
        data = {
            "client_id": DISCORD_CLIENT_ID,
            "client_secret": DISCORD_CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        response = requests.post(DISCORD_TOKEN_URL, data=data, headers=headers)
        response.raise_for_status()
        return response.json()

    def encrypt_token(self, token: str) -> str:
        """Encrypt a token for secure storage."""
        return self.fernet.encrypt(token.encode()).decode()

    def decrypt_token(self, encrypted_token: str) -> str:
        """Decrypt a stored token."""
        return self.fernet.decrypt(encrypted_token.encode()).decode()

    def link_discord_account(
        self,
        player: Player,
        discord_user_id: str,
        discord_username: str,
        discord_avatar_url: str,
        access_token: str,
        refresh_token: str,
        expires_in: int,
    ) -> DiscordAccount:
        """Link a Discord account to a Sound Royale player."""
        # Calculate token expiration
        expires_at = timezone.now() + timedelta(seconds=expires_in)

        # Encrypt tokens
        encrypted_access = self.encrypt_token(access_token)
        encrypted_refresh = self.encrypt_token(refresh_token)

        # Create or update Discord account
        discord_account, created = DiscordAccount.objects.update_or_create(
            discord_user_id=discord_user_id,
            defaults={
                "player": player,
                "discord_username": discord_username,
                "discord_avatar_url": discord_avatar_url,
                "access_token": encrypted_access,
                "refresh_token": encrypted_refresh,
                "token_expires_at": expires_at,
                "last_sync_at": timezone.now(),
            },
        )
        if player.discord_identity_id != discord_account.id:
            player.discord_identity = discord_account
            player.save(update_fields=["discord_identity"])

        return discord_account

    def unlink_discord_account(self, player: Player) -> bool:
        """Unlink a Discord account from a Sound Royale player."""
        try:
            discord_account = DiscordAccount.objects.get(player=player)
            discord_account.delete()
            return True
        except DiscordAccount.DoesNotExist:
            return False

    def get_discord_account(self, player: Player) -> DiscordAccount | None:
        """Get the Discord account linked to a player."""
        try:
            return DiscordAccount.objects.get(player=player)
        except DiscordAccount.DoesNotExist:
            return None

    def refresh_token_if_needed(self, discord_account: DiscordAccount) -> bool:
        """Refresh access token if it's expired or will expire soon."""
        if not discord_account.token_expires_at:
            return False

        # Refresh if token expires within 5 minutes
        if discord_account.token_expires_at > timezone.now() + timedelta(minutes=5):
            return True

        try:
            # Decrypt refresh token
            refresh_token = self.decrypt_token(discord_account.refresh_token)

            # Get new tokens
            token_data = self.refresh_access_token(refresh_token)

            # Update with new tokens
            discord_account.access_token = self.encrypt_token(token_data["access_token"])
            if "refresh_token" in token_data:
                discord_account.refresh_token = self.encrypt_token(token_data["refresh_token"])

            # Update expiration
            expires_in = token_data.get("expires_in", 3600)
            discord_account.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
            discord_account.last_sync_at = timezone.now()
            discord_account.save()

            return True
        except Exception:
            logger.exception("Failed to refresh Discord access token")
            return False

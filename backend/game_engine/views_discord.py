from django.shortcuts import redirect
from django.urls import reverse
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
import secrets
import hashlib
import base64
from requests_oauthlib import OAuth2Session
from requests.exceptions import RequestException
import logging

from .models import VerifiedUser, DiscordIdentity
from .helpers import _current_verified_user

logger = logging.getLogger(__name__)


class DiscordOAuthStartView(APIView):
    """Start Discord OAuth flow with PKCE and state parameter"""
    permission_classes = [AllowAny]

    def get(self, request):
        verified_user = _current_verified_user(request)
        if not verified_user:
            return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Check if user already has Discord linked
        if hasattr(verified_user, 'discord_identity'):
            return Response({"error": "Discord already linked"}, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate PKCE code verifier and challenge
        code_verifier = secrets.token_urlsafe(128)
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode()).digest()
        ).decode().replace('=', '')
        
        # Generate state parameter for CSRF protection
        state = secrets.token_urlsafe(32)
        
        # Store in session
        request.session['discord_code_verifier'] = code_verifier
        request.session['discord_state'] = state
        request.session['discord_verified_user_id'] = str(verified_user.id)
        request.session.save()
        
        # Build Discord authorization URL
        discord_client_id = getattr(settings, 'DISCORD_CLIENT_ID', None)
        if not discord_client_id:
            return Response({"error": "Discord OAuth not configured"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        redirect_uri = request.build_absolute_uri(reverse('discord-oauth-callback'))
        
        discord_auth_url = (
            f"https://discord.com/oauth2/authorize"
            f"?client_id={discord_client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&response_type=code"
            f"&scope=identify"
            f"&code_challenge={code_challenge}"
            f"&code_challenge_method=S256"
            f"&state={state}"
        )
        
        return redirect(discord_auth_url)


class DiscordOAuthCallbackView(APIView):
    """Handle Discord OAuth callback"""
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.GET.get('code')
        state = request.GET.get('state')
        error = request.GET.get('error')
        
        if error:
            return Response({"error": f"Discord OAuth error: {error}"}, status=status.HTTP_400_BAD_REQUEST)
        
        if not code or not state:
            return Response({"error": "Missing code or state"}, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify state parameter
        session_state = request.session.get('discord_state')
        if state != session_state:
            return Response({"error": "Invalid state parameter"}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get verified user from session
        verified_user_id = request.session.get('discord_verified_user_id')
        if not verified_user_id:
            return Response({"error": "Session expired"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            verified_user = VerifiedUser.objects.get(id=verified_user_id)
        except VerifiedUser.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        
        # Exchange code for tokens
        code_verifier = request.session.get('discord_code_verifier')
        if not code_verifier:
            return Response({"error": "Missing code verifier"}, status=status.HTTP_400_BAD_REQUEST)
        
        discord_client_id = getattr(settings, 'DISCORD_CLIENT_ID', None)
        discord_client_secret = getattr(settings, 'DISCORD_CLIENT_SECRET', None)
        
        if not discord_client_id or not discord_client_secret:
            return Response({"error": "Discord OAuth not configured"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        redirect_uri = request.build_absolute_uri(reverse('discord-oauth-callback'))
        
        try:
            oauth = OAuth2Session(discord_client_id, redirect_uri=redirect_uri)
            token_url = "https://discord.com/api/oauth2/token"
            token_data = oauth.fetch_token(
                token_url,
                code=code,
                code_verifier=code_verifier,
                client_secret=discord_client_secret
            )
            
            # Get user info from Discord
            user_url = "https://discord.com/api/users/@me"
            user_response = oauth.get(user_url)
            user_data = user_response.json()
            
            # Check if Discord ID is already linked to another account
            if DiscordIdentity.objects.filter(discord_id=user_data['id']).exists():
                return Response(
                    {"error": "Discord account already linked to another user"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create DiscordIdentity
            discord_identity = DiscordIdentity.objects.create(
                verified_user=verified_user,
                discord_id=user_data['id'],
                discord_username=user_data['username'],
                discord_avatar=user_data.get('avatar'),
                token_expires_at=timezone.now() + timezone.timedelta(seconds=token_data['expires_in'])
            )
            discord_identity.set_tokens(token_data['access_token'], token_data['refresh_token'])
            discord_identity.save()
            
            # Clear session
            del request.session['discord_code_verifier']
            del request.session['discord_state']
            del request.session['discord_verified_user_id']
            request.session.save()
            
            # Redirect to frontend success page
            frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:8080')
            return redirect(f"{frontend_url}/settings/discord/success")
            
        except RequestException as e:
            logger.error(f"Discord OAuth error: {e}")
            return Response({"error": "Failed to complete OAuth"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Discord OAuth Setup

## Overview

Sound Royale uses Discord OAuth2 for account linking, enabling features like ELO sync, role assignments, and match announcements.

## Development Setup

### Environment Variables

Set the following environment variables in your `.env` files:

**Root `.env`:**
```bash
DISCORD_REDIRECT_URI=http://localhost:8080/auth/discord/callback
```

**Backend `.env`:**
```bash
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_REDIRECT_URI=http://localhost:8080/auth/discord/callback
DISCORD_ENCRYPTION_KEY=your_encryption_key_here
```

### Important: Redirect URI

The `DISCORD_REDIRECT_URI` must point to the **frontend callback URL**, not the backend API endpoint.

- **Correct:** `http://localhost:8080/auth/discord/callback` (frontend route)
- **Incorrect:** `http://localhost:8000/api/auth/discord/callback` (backend API)

When Discord redirects after authorization, it sends the user to the frontend callback page, which then calls the backend API to complete the OAuth flow.

## Production Setup

### 1. Discord Application Configuration

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select or create your application
3. Go to **OAuth2 → Redirects**
4. Add your production frontend URL:
   ```
   https://your-frontend-domain.com/auth/discord/callback
   ```

### 2. Environment Variables

Update your production environment variables:

```bash
DISCORD_REDIRECT_URI=https://your-frontend-domain.com/auth/discord/callback
DISCORD_CLIENT_ID=your_production_discord_client_id
DISCORD_CLIENT_SECRET=your_production_discord_client_secret
DISCORD_BOT_TOKEN=your_production_discord_bot_token
DISCORD_ENCRYPTION_KEY=your_production_encryption_key
```

### 3. Security Notes

- Never commit `.env` files to version control
- Use strong, unique values for `DISCORD_ENCRYPTION_KEY`
- Restrict Discord application to authorized domains if possible
- Rotate secrets regularly

## OAuth Flow

1. User clicks "Link Discord Account" in the app
2. Frontend calls `/api/auth/discord/` to get authorization URL
3. Frontend stores OAuth state and player credentials in `sessionStorage`
4. Frontend redirects to Discord OAuth URL
5. User authorizes the application
6. Discord redirects to frontend callback URL (`/auth/discord/callback`)
7. Frontend callback page:
   - Validates state parameter
   - Calls `/api/auth/discord/callback/` with authorization code
   - Calls `/api/auth/discord/link/` to link account
   - Shows success/error and redirects to main page

## Troubleshooting

### "It just shows me the callback"

**Cause:** `DISCORD_REDIRECT_URI` is pointing to the backend API endpoint instead of the frontend callback URL.

**Fix:** Update `DISCORD_REDIRECT_URI` to point to your frontend URL:
- Development: `http://localhost:8080/auth/discord/callback`
- Production: `https://your-frontend-domain.com/auth/discord/callback`

### "Invalid or expired state parameter"

**Cause:** The OAuth state validation failed, likely due to:
- State mismatch between frontend and backend
- State expired (10-minute timeout)
- SessionStorage cleared during redirect

**Fix:** Ensure both frontend and backend are using the same state parameter and that `sessionStorage` is not being cleared unexpectedly.

## Related Files

- `backend/game_engine/discord_service.py` - Discord OAuth service
- `backend/game_engine/views.py` - Discord OAuth endpoints
- `src/pages/DiscordCallback.tsx` - Frontend callback page
- `src/components/game/DiscordLinkModal.tsx` - Link modal
- `src/services/api.ts` - Discord API calls

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { discordApi } from '@/services/api';
import { clearDiscordOAuthState, createDiscordSessionFromLinkResponse, getDiscordOAuthState, saveDiscordSession } from '@/services/discordSession';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function DiscordCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      // Retrieve stored OAuth state and player credentials (localStorage-first, sessionStorage fallback)
      const oauthState = getDiscordOAuthState();
      clearDiscordOAuthState();

      const storedState = oauthState?.state ?? null;
      const playerId = oauthState?.playerId ?? null;
      const playerSecret = oauthState?.playerSecret ?? null;

      if (!code || !state || !storedState || state !== storedState) {
        setStatus('error');
        toast.error('Invalid OAuth callback');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      if (!playerId || !playerSecret) {
        setStatus('error');
        toast.error('Player session not found');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      try {
        // Handle OAuth callback to get Discord user info and tokens
        const discordData = await discordApi.handleCallback(code, state);

        // Link Discord account to player
        const linkResponse = await discordApi.linkAccount(playerId, playerSecret, {
          discord_user_id: discordData.discord_user_id,
          discord_username: discordData.discord_username,
          discord_avatar_url: discordData.avatar,
          access_token: discordData.access_token,
          refresh_token: discordData.refresh_token,
          expires_in: discordData.expires_in,
        });
        saveDiscordSession(createDiscordSessionFromLinkResponse(linkResponse));

        setStatus('success');
        toast.success('Discord account linked successfully!');
        setTimeout(() => navigate('/'), 2000);
      } catch (error) {
        console.error('Failed to link Discord account:', error);
        setStatus('error');
        toast.error('Failed to link Discord account');
        setTimeout(() => navigate('/'), 3000);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        {status === 'loading' && (
          <div className="space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-[#5865F2] mx-auto" />
            <p className="text-foreground text-lg">Linking your Discord account...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Success!</h2>
              <p className="text-foreground">Your Discord account has been linked.</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <XCircle className="h-16 w-16 text-red-500 mx-auto" />
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Error</h2>
              <p className="text-foreground">Failed to link your Discord account.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

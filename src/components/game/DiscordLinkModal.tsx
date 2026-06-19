import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { discordApi } from '@/services/api';
import {
  clearDiscordSession,
  getDiscordSession,
  saveDiscordOAuthState,
} from '@/services/discordSession';
import { useUser } from '@/context/UserContext';
import { Loader2, Link as LinkIcon, Unlink, CheckCircle, XCircle, Shield } from 'lucide-react';
import { PrivacySettings } from './PrivacySettings';

interface DiscordLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: () => void;
}

export function DiscordLinkModal({ isOpen, onClose, onStatusChange }: DiscordLinkModalProps) {
  const { userSession } = useUser();
  const [loading, setLoading] = useState(false);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [accountStatus, setAccountStatus] = useState<{
    is_linked: boolean;
    discord_user_id?: string;
    discord_username?: string;
    discord_avatar_url?: string;
    discord_session_secret?: string;
  } | null>(null);
  const [step, setStep] = useState<'check' | 'linking' | 'success' | 'error'>('check');

  useEffect(() => {
    if (isOpen) {
      checkAccountStatus();
    }
  }, [isOpen, userSession.playerId, userSession.playerSecret]);

  const checkAccountStatus = async () => {
    setLoading(true);
    try {
      const storedDiscordSession = getDiscordSession();
      const status =
        userSession.playerId && userSession.playerSecret
          ? await discordApi.getAccountStatus(userSession.playerId, userSession.playerSecret)
          : storedDiscordSession
            ? await discordApi.getAccountStatusBySession(
                storedDiscordSession.discordUserId,
                storedDiscordSession.sessionSecret,
              )
            : null;
      if (!status) {
        setAccountStatus(null);
        setStep('check');
        return;
      }
      setAccountStatus(status);
      setStep(status.is_linked ? 'success' : 'check');
    } catch (error) {
      console.error('Failed to check Discord account status:', error);
      toast.error('Failed to check Discord account status');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkDiscord = async () => {
    if (!userSession.playerId || !userSession.playerSecret) {
      toast.error('Player session not found');
      return;
    }

    setLoading(true);
    try {
      // Get OAuth authorization URL
      const { authorization_url, state } = await discordApi.getAuthUrl();

      // Store state in localStorage (with sessionStorage fallback) for callback validation
      saveDiscordOAuthState(state, userSession.playerId!, userSession.playerSecret!);

      // Redirect to Discord OAuth
      window.location.href = authorization_url;
    } catch (error) {
      console.error('Failed to initiate Discord OAuth:', error);
      toast.error('Failed to initiate Discord OAuth');
      setLoading(false);
    }
  };

  const handleUnlinkDiscord = async () => {
    if (!userSession.playerId || !userSession.playerSecret) {
      toast.error('Player session not found');
      return;
    }

    setLoading(true);
    try {
      await discordApi.unlinkAccount(userSession.playerId, userSession.playerSecret);
      clearDiscordSession();
      toast.success('Discord account unlinked successfully');
      setAccountStatus(null);
      setStep('check');
      onStatusChange?.();
    } catch (error) {
      console.error('Failed to unlink Discord account:', error);
      toast.error('Failed to unlink Discord account');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutDiscord = () => {
    clearDiscordSession();
    setAccountStatus(null);
    setStep('check');
    toast.success('Signed out of Discord on this device');
    onStatusChange?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5865F2]/20">
              <LinkIcon className="h-5 w-5 text-[#5865F2]" />
            </div>
            Discord Integration
          </DialogTitle>
          <DialogDescription>
            Link your Discord account to enable ELO sync, role assignments, and match announcements.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#5865F2]" />
            </div>
          ) : accountStatus?.is_linked ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/30">
                {accountStatus.discord_avatar_url && (
                  <img
                    src={accountStatus.discord_avatar_url}
                    alt="Discord Avatar"
                    className="h-12 w-12 rounded-full"
                  />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-semibold text-white">
                      {accountStatus.discord_username}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">Discord account linked</p>
                </div>
              </div>
              <div className="text-sm text-gray-400">
                <p className="font-medium text-white mb-2">Benefits of linking:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>ELO rating sync to Discord</li>
                  <li>Role assignments based on ELO tier</li>
                  <li>Match announcements in servers</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#5865F2]/20 mx-auto mb-3">
                  <LinkIcon className="h-8 w-8 text-[#5865F2]" />
                </div>
                <p className="text-gray-300 mb-4">
                  Connect your Discord account to unlock advanced features
                </p>
              </div>
              <div className="text-sm text-gray-400 space-y-2">
                <p className="font-medium text-white mb-2">Benefits of linking:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>ELO rating sync to Discord</li>
                  <li>Role assignments based on ELO tier</li>
                  <li>Match announcements in servers</li>
                  <li>Privacy controls for data sharing</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {loading ? (
            <Button disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </Button>
          ) : accountStatus?.is_linked ? (
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => setShowPrivacySettings(true)}
                className="flex-1 gap-2"
              >
                <Shield className="h-4 w-4" />
                Privacy Settings
              </Button>
              <Button
                variant="destructive"
                onClick={handleUnlinkDiscord}
                disabled={!userSession.playerId || !userSession.playerSecret}
                className="flex-1 gap-2"
              >
                <Unlink className="h-4 w-4" />
                Unlink
              </Button>
              <Button variant="outline" onClick={handleSignOutDiscord} className="flex-1">
                Sign Out
              </Button>
            </div>
          ) : (
            <Button onClick={handleLinkDiscord} className="bg-[#5865F2] hover:bg-[#4752C4] gap-2">
              <LinkIcon className="h-4 w-4" />
              Link Discord Account
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <PrivacySettings isOpen={showPrivacySettings} onClose={() => setShowPrivacySettings(false)} />
    </Dialog>
  );
}

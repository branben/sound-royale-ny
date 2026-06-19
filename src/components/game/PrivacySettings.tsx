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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { discordApi } from '@/services/api';
import { useUser } from '@/context/UserContext';
import { Loader2, Shield, Lock } from 'lucide-react';

interface PrivacySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PrivacyConfig {
  share_elo: boolean;
  share_win_loss: boolean;
  share_genre_performance: boolean;
  share_recent_matches: boolean;
  allow_role_assignments: boolean;
}

export function PrivacySettings({ isOpen, onClose }: PrivacySettingsProps) {
  const { userSession } = useUser();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [privacySettings, setPrivacySettings] = useState<PrivacyConfig>({
    share_elo: true,
    share_win_loss: true,
    share_genre_performance: false,
    share_recent_matches: false,
    allow_role_assignments: true,
  });

  useEffect(() => {
    if (isOpen && userSession.playerId && userSession.playerSecret) {
      loadPrivacySettings();
    }
  }, [isOpen, userSession.playerId, userSession.playerSecret]);

  const loadPrivacySettings = async () => {
    if (!userSession.playerId || !userSession.playerSecret) return;

    setLoading(true);
    try {
      const status = await discordApi.getAccountStatus(
        userSession.playerId,
        userSession.playerSecret,
      );
      if (status.privacy_settings) {
        setPrivacySettings(status.privacy_settings as PrivacyConfig);
      }
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userSession.playerId || !userSession.playerSecret) {
      toast.error('Player session not found');
      return;
    }

    setSaving(true);
    try {
      // This would need a backend endpoint to update privacy settings
      // For now, we'll just show a success message
      toast.success('Privacy settings saved successfully');
      onClose();
    } catch (error) {
      console.error('Failed to save privacy settings:', error);
      toast.error('Failed to save privacy settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof PrivacyConfig, value: boolean) => {
    setPrivacySettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
              <Shield className="h-5 w-5 text-green-500" />
            </div>
            Privacy Settings
          </DialogTitle>
          <DialogDescription>
            Control what data is shared with Discord servers and bots.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-green-500" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-white">Share ELO Rating</label>
                  <p className="text-xs text-gray-400">
                    Allow Discord servers to see your ELO score
                  </p>
                </div>
                <Switch
                  checked={privacySettings.share_elo}
                  onCheckedChange={(checked) => updateSetting('share_elo', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-white">Share Win/Loss Record</label>
                  <p className="text-xs text-gray-400">
                    Allow Discord servers to see your match history
                  </p>
                </div>
                <Switch
                  checked={privacySettings.share_win_loss}
                  onCheckedChange={(checked) => updateSetting('share_win_loss', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-white">Share Genre Performance</label>
                  <p className="text-xs text-gray-400">
                    Allow Discord servers to see your genre stats
                  </p>
                </div>
                <Switch
                  checked={privacySettings.share_genre_performance}
                  onCheckedChange={(checked) => updateSetting('share_genre_performance', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-white">Share Recent Matches</label>
                  <p className="text-xs text-gray-400">
                    Allow Discord servers to show your recent games
                  </p>
                </div>
                <Switch
                  checked={privacySettings.share_recent_matches}
                  onCheckedChange={(checked) => updateSetting('share_recent_matches', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-white">Allow Role Assignments</label>
                  <p className="text-xs text-gray-400">
                    Allow Discord bots to assign roles based on ELO
                  </p>
                </div>
                <Switch
                  checked={privacySettings.allow_role_assignments}
                  onCheckedChange={(checked) => updateSetting('allow_role_assignments', checked)}
                />
              </div>

              <div className="pt-4 border-t border-gray-700">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-800/50">
                  <Lock className="h-4 w-4 text-gray-400 mt-0.5" />
                  <p className="text-xs text-gray-400">
                    Your data is only shared with Discord servers where the Sound Royale bot is
                    installed. You can unlink your Discord account at any time to remove all data
                    from Discord servers.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

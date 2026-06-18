import React from 'react';
import { Button } from '@/components/ui/button';
import { Gamepad2, Plus, Users, Loader2 } from 'lucide-react';
import { DiscordProfileCard } from '@/components/game/DiscordProfileCard';
import { DiscordAccountStatus } from '@/types/game';

interface LobbyLandingProps {
  playerNameInput: string;
  isLoading: boolean;
  discordAccountStatus: DiscordAccountStatus | null;
  onQuickMatch: () => void;
  onCreateMode: () => void;
  onJoinMode: () => void;
  onBrowseRooms: () => void;
  onLinkDiscord: () => void;
  onManageDiscord: () => void;
}

export function LobbyLanding({
  playerNameInput,
  isLoading,
  discordAccountStatus,
  onQuickMatch,
  onCreateMode,
  onJoinMode,
  onBrowseRooms,
  onLinkDiscord,
  onManageDiscord,
}: LobbyLandingProps) {
  return (
    <div className="space-y-4">
      {/* Primary CTA — Quick Match */}
      <Button
        data-testid="quick-match-button"
        onClick={onQuickMatch}
        disabled={!playerNameInput.trim() || isLoading}
        className="w-full h-16 text-xl font-bold bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-200 tracking-wide"
        size="lg"
      >
        {isLoading ? (
          <Loader2 className="mr-3 h-6 w-6 animate-spin" />
        ) : (
          <Gamepad2 className="mr-3 h-6 w-6" />
        )}
        {isLoading ? 'Finding Match...' : 'QUICK MATCH'}
      </Button>

      {/* Secondary actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          data-testid="create-room-button"
          onClick={onCreateMode}
          disabled={!playerNameInput.trim()}
          variant="outline"
          className="h-12 text-sm font-bold border-2 border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/10 transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Room
        </Button>

        <Button
          data-testid="join-room-mode-button"
          onClick={onJoinMode}
          disabled={!playerNameInput.trim()}
          variant="outline"
          className="h-12 text-sm font-bold border-2 border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/10 transition-all duration-200"
        >
          <Users className="mr-2 h-4 w-4" />
          Join Room
        </Button>
      </div>

      {/* Tertiary */}
      <Button
        onClick={onBrowseRooms}
        variant="ghost"
        size="sm"
        className="w-full text-sm text-muted-foreground hover:text-foreground"
      >
        Browse Active Rooms
      </Button>

      {/* Discord section — visually separated */}
      <div className="pt-4 border-t border-muted-foreground/20">
        <p className="text-xs text-muted-foreground text-center mb-3 uppercase tracking-wider font-medium">Connect Account</p>
        {discordAccountStatus?.is_linked && discordAccountStatus.discord_username ? (
          <DiscordProfileCard
            discordUsername={discordAccountStatus.discord_username}
            discordAvatarUrl={discordAccountStatus.discord_avatar_url}
            linkedAt={discordAccountStatus.linked_at}
            onManage={onManageDiscord}
          />
        ) : (
          <Button
            onClick={onLinkDiscord}
            variant="ghost"
            size="sm"
            className="w-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Link Discord
          </Button>
        )}
      </div>
    </div>
  );
}

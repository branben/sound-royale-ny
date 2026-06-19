import React from 'react';
import { PlayerNameInput } from '@/components/lobby/PlayerNameInput';
import { LobbyLanding } from '@/components/lobby/LobbyLanding';
import { JoinRoomForm } from '@/components/lobby/JoinRoomForm';
import { CreateRoomForm } from '@/components/lobby/CreateRoomForm';
import { ThemeId, DiscordAccountStatus } from '@/types/game';

interface LobbyModeSwitcherProps {
  mode: 'landing' | 'join' | 'create';
  playerNameInput: string;
  roomCode: string;
  roomNameInput: string;
  selectedThemeId: ThemeId;
  selectedCustomGenres: string[];
  isLoading: boolean;
  error: string | null;
  discordAccountStatus: DiscordAccountStatus | null;
  onPlayerNameChange: (value: string) => void;
  onRoomNameChange: (value: string) => void;
  onThemeChange: (themeId: ThemeId) => void;
  onCustomGenresChange: (genres: string[]) => void;
  onCodeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onJoin: () => void;
  onCreate: () => void;
  onQuickMatch: () => void;
  onCreateMode: () => void;
  onJoinMode: () => void;
  onBack: () => void;
  onBrowseRooms: () => void;
  onLinkDiscord: () => void;
  onManageDiscord: () => void;
}

export function LobbyModeSwitcher({
  mode,
  playerNameInput,
  roomCode,
  roomNameInput,
  selectedThemeId,
  selectedCustomGenres,
  isLoading,
  error,
  discordAccountStatus,
  onPlayerNameChange,
  onRoomNameChange,
  onThemeChange,
  onCustomGenresChange,
  onCodeChange,
  onJoin,
  onCreate,
  onQuickMatch,
  onCreateMode,
  onJoinMode,
  onBack,
  onBrowseRooms,
  onLinkDiscord,
  onManageDiscord,
}: LobbyModeSwitcherProps) {
  return (
    <div className="space-y-5">
      <PlayerNameInput value={playerNameInput} onChange={onPlayerNameChange} />

      {mode === 'landing' && (
        <LobbyLanding
          playerNameInput={playerNameInput}
          isLoading={isLoading}
          discordAccountStatus={discordAccountStatus}
          onQuickMatch={onQuickMatch}
          onCreateMode={onCreateMode}
          onJoinMode={onJoinMode}
          onBrowseRooms={onBrowseRooms}
          onLinkDiscord={onLinkDiscord}
          onManageDiscord={onManageDiscord}
        />
      )}

      {mode === 'join' && (
        <JoinRoomForm
          roomCode={roomCode}
          isLoading={isLoading}
          error={error}
          onCodeChange={onCodeChange}
          onJoin={onJoin}
          onBack={onBack}
        />
      )}

      {mode === 'create' && (
        <CreateRoomForm
          roomNameInput={roomNameInput}
          selectedThemeId={selectedThemeId}
          selectedCustomGenres={selectedCustomGenres}
          isLoading={isLoading}
          error={error}
          onRoomNameChange={onRoomNameChange}
          onThemeChange={onThemeChange}
          onCustomGenresChange={onCustomGenresChange}
          onCreate={onCreate}
          onBack={onBack}
        />
      )}
    </div>
  );
}

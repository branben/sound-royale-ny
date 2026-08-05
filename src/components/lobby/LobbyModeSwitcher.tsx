import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

      <AnimatePresence mode="wait" initial={false}>
        {mode === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
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
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.div
            key="join"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <JoinRoomForm
              roomCode={roomCode}
              isLoading={isLoading}
              error={error}
              onCodeChange={onCodeChange}
              onJoin={onJoin}
              onBack={onBack}
            />
          </motion.div>
        )}

        {mode === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

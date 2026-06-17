import React from 'react';
import { OnboardingModal } from '@/components/game/OnboardingModal';
import { RoomBrowser } from '@/components/game/RoomBrowser';
import { DiscordLinkModal } from '@/components/game/DiscordLinkModal';

interface LobbyModalsProps {
  showOnboarding: boolean;
  showRoomBrowser: boolean;
  showDiscordModal: boolean;
  onOnboardingClose: () => void;
  onRoomBrowserClose: () => void;
  onRoomJoined: (roomCode: string) => void;
  onDiscordModalClose: () => void;
  onDiscordStatusChange: () => void;
}

export function LobbyModals({
  showOnboarding,
  showRoomBrowser,
  showDiscordModal,
  onOnboardingClose,
  onRoomBrowserClose,
  onRoomJoined,
  onDiscordModalClose,
  onDiscordStatusChange,
}: LobbyModalsProps) {
  return (
    <>
      <OnboardingModal isOpen={showOnboarding} onClose={onOnboardingClose} />

      <RoomBrowser
        isOpen={showRoomBrowser}
        onClose={onRoomBrowserClose}
        onRoomJoined={onRoomJoined}
      />

      <DiscordLinkModal
        isOpen={showDiscordModal}
        onClose={onDiscordModalClose}
        onStatusChange={onDiscordStatusChange}
      />
    </>
  );
}

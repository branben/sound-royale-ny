import { Page } from '@playwright/test';

declare global {
  interface Window {
    __E2E_TESTING__?: boolean;
  }
}

export async function enableE2EMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__E2E_TESTING__ = true;
  });
}

export async function setupPlayerSession(
  page: Page,
  session: {
    playerName: string;
    playerId: string;
    playerSecret: string;
    roomCode?: string;
    isSpectator?: boolean;
  },
): Promise<void> {
  await page.addInitScript((s) => {
    const roomCode = s.roomCode ?? 'test-room';
    const sessionKey = `${roomCode}:${s.playerId}`;
    localStorage.setItem(
      'soundRoyaleSessions',
      JSON.stringify({
        [sessionKey]: {
          roomCode,
          playerName: s.playerName,
          playerId: s.playerId,
          playerSecret: s.playerSecret,
          isSpectator: s.isSpectator ?? false,
        },
      }),
    );
    sessionStorage.setItem('soundRoyaleActiveSessionKey', sessionKey);
  }, session);
}

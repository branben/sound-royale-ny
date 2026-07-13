import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// Regression test for BUG-1 (bug_risk):
//
//   The gameSocket `onMessage` callback in GameContext handles several message
//   types (`game_state_update`, `timer_tick`, `host_migrated`) by calling
//   setState (setGameState / setTimeRemaining) WITHOUT an `isMounted.current`
//   guard. Only the `error` case is guarded.
//
//   A WebSocket message can arrive after the component has unmounted — the
//   socket is disconnected asynchronously in the effect cleanup, so an in-flight
//   frame can still invoke onMessage. When it does, the handler runs its body
//   and setState fires on an unmounted component (a memory-leak / no-op-update
//   bug).
//
// How this test detects the bug deterministically (rather than relying on a
// React console warning, which React 18 no longer emits):
//   We hand the handler a message whose `payload` is a Proxy that records ANY
//   property access. The FIX is an early `if (!isMounted.current) return;` at
//   the very top of handleMessage — with it, the handler returns BEFORE reading
//   `message.payload`, so no access is recorded. WITHOUT the guard, the switch
//   body reads payload fields to build the setState update, so access IS
//   recorded.
//
//   => FAILS on the current (unguarded) code, PASSES once the guard is added.

// --- Mock the UserContext -------------------------------------------------
vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// --- Mock the API module (roomApi.getRoom is called on mount) -------------
const mockRoomResponse = {
  code: 'ABCD',
  status: 'playing',
  players: [
    {
      id: 'player-1',
      name: 'TestPlayer',
      is_host: true,
      board: { tiles: [{ id: 'tile-1', genre: 'House', status: 'complete' as const }] },
    },
  ],
  current_round: 1,
};
const getRoomMock = vi.fn().mockResolvedValue(mockRoomResponse);

vi.mock('@/services/api', () => ({
  roomApi: {
    getRoom: (...args: unknown[]) => getRoomMock(...(args as [string])),
  },
  gameApi: {},
  getStoredAccessToken: vi.fn(() => null),
  normalizeRoomWinner: vi.fn((w: unknown) => {
    if (!w) return undefined;
    if (typeof w === 'string') return w;
    if (typeof w === 'object' && w !== null && 'id' in w) return (w as { id: string }).id;
    return undefined;
  }),
}));

// --- Mock the gameSocket, capturing the onMessage callback ---------------
const captured: {
  onMessage?: (message: GameSocketMessage) => void;
} = {};
const connectMock = vi.fn(
  (options: { onMessage?: (message: GameSocketMessage) => void }) => {
    captured.onMessage = options.onMessage;
  },
);

vi.mock('@/services/gameSocket', () => {
  const impl = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: { onMessage?: (m: GameSocketMessage) => void }) => void)(
        ...(args as [{ onMessage?: (m: GameSocketMessage) => void }]),
      ),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return { __esModule: true, default: impl, gameSocket: impl };
});

// Mock framer-motion to avoid animation issues in tests.
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(
      ({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) =>
        React.createElement('div', { ...props, ref }, children as React.ReactNode),
    ),
    button: React.forwardRef(
      ({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLButtonElement>) =>
        React.createElement('button', { ...props, ref }, children as React.ReactNode),
    ),
    span: React.forwardRef(
      ({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLSpanElement>) =>
        React.createElement('span', { ...props, ref }, children as React.ReactNode),
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const mockUseUser = useUser as unknown as ReturnType<typeof vi.fn>;

function createDefaultUserSession() {
  return {
    userSession: {
      roomCode: null,
      playerName: 'TestPlayer',
      playerId: 'player-1',
      playerSecret: 'secret-1',
      isSpectator: false,
      isAuthenticated: true,
    },
    setPlayerName: vi.fn(),
    setPlayerCredentials: vi.fn(),
    setSpectatorMode: vi.fn(),
    setActiveRoomSession: vi.fn(),
    clearSession: vi.fn(),
    ensureAnonymousSession: vi.fn(),
    isAuthenticated: true,
    isHost: vi.fn().mockReturnValue(false),
    requestLoginCode: vi.fn(),
    verifyLoginCode: vi.fn(),
    logoutVerifiedUser: vi.fn(),
  };
}

/**
 * Build a message whose payload is a Proxy that flips `touched.value = true`
 * on ANY property read. If handleMessage runs its body after unmount, it reads
 * payload fields (touching the proxy); if the isMounted guard short-circuits
 * first, the payload is never read.
 */
function makeTrackedMessage(
  type: GameSocketMessage['type'],
  rawPayload: Record<string, unknown>,
): { message: GameSocketMessage; touched: { value: boolean } } {
  const touched = { value: false };
  const payload = new Proxy(rawPayload, {
    get(target, prop, receiver) {
      touched.value = true;
      return Reflect.get(target, prop, receiver);
    },
  });
  return { message: { type, payload } as unknown as GameSocketMessage, touched };
}

const messageFactories: Record<string, () => Record<string, unknown>> = {
  game_state_update: () => ({
    gameId: 'ABCD',
    roomCode: 'ABCD',
    status: 'playing',
    players: {},
    currentRound: 2,
  }),
  timer_tick: () => ({ timeRemaining: 42 }),
  host_migrated: () => ({ newHostId: 'player-1', newHostName: 'TestPlayer' }),
};

describe('GameContext — no setState after unmount (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  async function renderThenUnmount() {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <div data-testid="child" />
      </GameProvider>,
    );

    // Wait for the socket effect to register its onMessage handler + settle the
    // initial mount fetch, so we start from a fully mounted, stable state.
    await waitFor(() => expect(captured.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    const onMessage = captured.onMessage!;
    unmount();
    return onMessage;
  }

  it.each(Object.keys(messageFactories))(
    'ignores a "%s" socket message that arrives after unmount (does not touch payload / setState)',
    async (type) => {
      const onMessage = await renderThenUnmount();
      const { message, touched } = makeTrackedMessage(
        type as GameSocketMessage['type'],
        messageFactories[type](),
      );

      // A late frame delivers a socket message after the component unmounted.
      await act(async () => {
        onMessage(message);
      });

      // With the isMounted guard, handleMessage returns before reading the
      // payload. Without it, the switch body reads payload fields to build the
      // setState update — proving setState ran on an unmounted component.
      expect(touched.value).toBe(false);
    },
  );
});

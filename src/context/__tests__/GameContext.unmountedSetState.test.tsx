import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// BUG-1 (bug_risk) regression test.
//
// The gameSocket message handler (handleMessage in GameContext) calls
// setGameState / setTimeRemaining WITHOUT checking `isMounted.current`. If a
// socket message arrives after the GameProvider has unmounted — a real race
// during a disconnect or navigation — the component performs a state update on
// an unmounted component.
//
// React 18 no longer prints the classic "Can't perform a React state update on
// an unmounted component" console warning, so asserting on console output does
// NOT catch this bug. Instead we assert on the observable BEHAVIOR:
//
//   The `game_state_update` branch does `setGameState((prev) => ({ ...,
//   status: newState.status, ... }))`. That updater callback — and therefore
//   the read of `payload.status` — only executes when setGameState is actually
//   invoked on a live component.
//
// We deliver a payload whose `status` is a getter that counts reads:
//   - Unguarded (current) code: setGameState IS called after unmount, React
//     runs the updater, `status` is read  → count === 1  → test FAILS.
//   - Guarded (fixed) code (`if (!isMounted.current) return;`): setGameState is
//     never called, the updater never runs → count === 0 → test PASSES.
//
// This has been verified empirically against both the current code (count 1)
// and a locally-guarded copy (count 0).
// ---------------------------------------------------------------------------

vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

const mockRoomResponse = {
  code: 'ABCD',
  status: 'playing',
  players: [
    {
      id: 'player-1',
      name: 'TestPlayer',
      is_host: true,
      is_ready: true,
      board: {
        tiles: [{ id: 'tile-1', genre: 'House', status: 'complete' as const }],
      },
    },
  ],
  current_round: 2,
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

// Capture the socket callbacks — crucially `onMessage`, so the test can deliver
// a message AFTER the provider unmounts.
const connectOptions: {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
  onMessage?: (message: GameSocketMessage) => void;
} = {};
const connectMock = vi.fn((options: typeof connectOptions) => {
  connectOptions.onConnect = options.onConnect;
  connectOptions.onDisconnect = options.onDisconnect;
  connectOptions.onMessage = options.onMessage;
});

vi.mock('@/services/gameSocket', () => ({
  __esModule: true,
  default: {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof connectOptions) => void)(...(args as [typeof connectOptions])),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  },
  gameSocket: {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof connectOptions) => void)(...(args as [typeof connectOptions])),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  },
}));

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

// Build a `game_state_update` message whose `status` field is an
// instrumented getter. `status` is read ONLY inside the setGameState updater
// callback in handleMessage, so a read after unmount proves setGameState was
// invoked on the unmounted component.
function instrumentedGameStateUpdate(counter: { reads: number }): GameSocketMessage {
  const payload: Record<string, unknown> = {
    gameId: 'ABCD',
    roomCode: 'ABCD',
    currentRound: 5,
    players: {
      'player-1': { name: 'TestPlayer', isHost: true, board: { tiles: [] } },
    },
  };
  Object.defineProperty(payload, 'status', {
    enumerable: true,
    get() {
      counter.reads += 1;
      return 'voting';
    },
  });
  return { type: 'game_state_update', payload } as unknown as GameSocketMessage;
}

describe('GameContext — no setState from a socket message after unmount (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    connectOptions.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('does not run setGameState when a game_state_update arrives after the provider unmounts', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <div />
      </GameProvider>,
    );

    // Wait until the socket connected and the message handler registered.
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    const onMessage = connectOptions.onMessage!;

    // Unmount the provider — this is the disconnect/navigation race window.
    unmount();

    // A late socket message arrives AFTER unmount.
    const counter = { reads: 0 };
    act(() => {
      onMessage(instrumentedGameStateUpdate(counter));
    });

    // The setGameState updater must NOT run on the unmounted component.
    // Guarded (fixed) code → 0 reads. Unguarded (buggy) code → 1 read.
    expect(
      counter.reads,
      'setGameState ran after unmount — add `if (!isMounted.current) return;` to the ' +
        'gameSocket message handler so late messages do not update unmounted state.',
    ).toBe(0);
  });
});

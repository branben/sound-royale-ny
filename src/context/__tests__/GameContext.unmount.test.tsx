import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// Mock the UserContext
vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// Minimal authoritative room snapshot for the mount fetch.
const mockRoomResponse = {
  code: 'ABCD',
  status: 'playing',
  players: [
    {
      id: 'player-1',
      name: 'TestPlayer',
      is_host: true,
      board: { tiles: [] },
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

// Capture the socket callbacks so the test can drive an incoming message
// AFTER the provider has unmounted — simulating a late WS frame delivered by a
// socket whose listeners haven't fully torn down at disconnect time.
const connectOptions: {
  onMessage?: (message: GameSocketMessage) => void;
} = {};
const connectMock = vi.fn((options: typeof connectOptions) => {
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
 * Regression test for BUG-1 (bug_risk):
 *
 *   The GameContext WebSocket `onMessage` handler calls React state setters
 *   (setGameState / setTimeRemaining) WITHOUT an `isMounted.current` guard.
 *   If a socket frame lands after the provider unmounts, the handler still
 *   dispatches a state update on an unmounted component (a leak / no-op update;
 *   React 18 no longer logs the old "setState on an unmounted component"
 *   warning, so it must be caught by observing the dispatch itself).
 *
 * HOW THIS DETECTS THE BUG:
 *   We wrap `React.useState` so every state setter the provider creates is
 *   instrumented. We start recording *after* unmount, then deliver a socket
 *   message. A correctly guarded handler returns early
 *   (`if (!isMounted.current) return;`) and dispatches NOTHING, so the recorded
 *   setter-call count stays 0. The unguarded handler dispatches
 *   setGameState/setTimeRemaining, driving the count above 0.
 *
 *   => FAILS today (no guard, count > 0); PASSES once the guard is added.
 */
describe('GameContext — no setState after unmount (BUG-1 regression)', () => {
  let useStateSpy: ReturnType<typeof vi.spyOn>;
  // Number of state-setter invocations observed while `recording` is true.
  let setterCallsSinceUnmount = 0;
  let recording = false;

  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());

    setterCallsSinceUnmount = 0;
    recording = false;

    // Instrument every useState setter created during render. Each setter is
    // wrapped so that, once `recording` is on (post-unmount), any dispatch is
    // counted. The real setter is still called so behavior is unchanged.
    const realUseState = React.useState.bind(React);
    useStateSpy = vi.spyOn(React, 'useState').mockImplementation(((init: unknown) => {
      const [value, setValue] = realUseState(init as never);
      const wrapped = ((...args: unknown[]) => {
        if (recording) setterCallsSinceUnmount += 1;
        return (setValue as (...a: unknown[]) => void)(...args);
      }) as typeof setValue;
      return [value, wrapped] as never;
    }) as typeof React.useState);
  });

  afterEach(() => {
    useStateSpy.mockRestore();
  });

  it('dispatches no state update when a timer_tick arrives after unmount', async () => {
    const { unmount } = render(<GameProvider roomCode="ABCD" />);

    // Wait for the socket to "connect" so onMessage is captured.
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    const onMessage = connectOptions.onMessage!;

    // Tear the provider down, THEN deliver a late frame while recording.
    unmount();
    recording = true;
    act(() => {
      onMessage({ type: 'timer_tick', payload: { timeRemaining: 42 } });
    });

    expect(setterCallsSinceUnmount).toBe(0);
  });

  it('dispatches no state update when a game_state_update arrives after unmount', async () => {
    const { unmount } = render(<GameProvider roomCode="ABCD" />);

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    const onMessage = connectOptions.onMessage!;

    unmount();
    recording = true;
    act(() => {
      onMessage({
        type: 'game_state_update',
        // The handler reads only a subset of GameState fields; this payload
        // intentionally exercises the setGameState-after-unmount path.
        payload: {
          gameId: 'ABCD',
          roomCode: 'ABCD',
          status: 'playing',
          players: {},
          currentRound: 2,
        } as unknown as Extract<
          GameSocketMessage,
          { type: 'game_state_update' }
        >['payload'],
      });
    });

    expect(setterCallsSinceUnmount).toBe(0);
  });
});

import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// BUG-1 (bug_risk): the gameSocket message handler in GameContext calls the
// React state setters (setGameState / setTimeRemaining) with NO
// `isMounted.current` guard. If a socket frame arrives after the provider has
// unmounted (a very common real-world race — the socket's onmessage fires
// during teardown, or a buffered frame is delivered right after navigation),
// the handler performs a state update on an unmounted component.
//
// Why we spy on the state SETTERS rather than console:
//   React 18 no longer prints the old "state update on an unmounted component"
//   warning, and it silently short-circuits (drops) an update scheduled on an
//   unmounted fiber — so there is NO console.error and NO act(...) warning to
//   catch. The only observable difference between the buggy and fixed code is
//   whether the handler *calls the setter at all* after unmount:
//     - buggy   (unguarded): the handler still invokes the setters  -> FAIL
//     - fixed   (guarded):   `if (!isMounted.current) return;` skips them -> PASS
//
// So this test wraps React.useState, counts setter invocations that happen
// AFTER unmount, and asserts that number is zero. It fails against the current
// unguarded handler and passes once each socket-driven setState is guarded.
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

// Capture the socket callbacks so the test can drive messages directly.
const socketCallbacks: {
  onMessage?: (m: GameSocketMessage) => void;
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
} = {};

const connectMock = vi.fn((options: typeof socketCallbacks) => {
  socketCallbacks.onMessage = options.onMessage;
  socketCallbacks.onConnect = options.onConnect;
  socketCallbacks.onDisconnect = options.onDisconnect;
});

vi.mock('@/services/gameSocket', () => {
  const impl = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof socketCallbacks) => void)(...(args as [typeof socketCallbacks])),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return { __esModule: true, default: impl, gameSocket: impl };
});

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

const gameStateUpdate = {
  type: 'game_state_update',
  payload: {
    gameId: 'ABCD',
    roomCode: 'ABCD',
    status: 'playing',
    players: {
      'player-1': { id: 'player-1', name: 'TestPlayer', board: { tiles: [] } },
    },
    currentRound: 5,
  },
} as unknown as GameSocketMessage;

const timerTick: GameSocketMessage = {
  type: 'timer_tick',
  payload: { timeRemaining: 42 },
};

// ---------------------------------------------------------------------------
// useState setter tracking. We wrap React.useState so that every setter the
// GameProvider creates is instrumented; while `tracking` is on we count each
// call. We only turn tracking on *after* unmount, so the count reflects
// exactly the socket-driven state updates that leaked past teardown.
// ---------------------------------------------------------------------------
let setterCallsAfterUnmount = 0;
let tracking = false;

describe('GameContext — BUG-1: socket setState after unmount', () => {
  let useStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    socketCallbacks.onMessage = undefined;
    socketCallbacks.onConnect = undefined;
    socketCallbacks.onDisconnect = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());

    setterCallsAfterUnmount = 0;
    tracking = false;

    const realUseState = React.useState.bind(React);
    useStateSpy = vi.spyOn(React, 'useState').mockImplementation(((init: unknown) => {
      const [value, setValue] = realUseState(init as never);
      const wrapped = (...args: unknown[]) => {
        if (tracking) setterCallsAfterUnmount += 1;
        return (setValue as (...a: unknown[]) => void)(...args);
      };
      return [value, wrapped];
    }) as typeof React.useState);
  });

  afterEach(() => {
    useStateSpy.mockRestore();
  });

  it('does not invoke a state setter when a game_state_update arrives after unmount', async () => {
    const { unmount } = render(<GameProvider roomCode="ABCD" />);

    await waitFor(() => expect(socketCallbacks.onMessage).toBeTypeOf('function'));
    // Let the initial mount fetch settle so no pending async update overlaps.
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    // Tear the provider down — this flips isMounted.current to false.
    unmount();

    // Only count setter calls from here on.
    tracking = true;

    // A socket frame is delivered AFTER unmount (the real-world race).
    act(() => {
      socketCallbacks.onMessage!(gameStateUpdate);
    });

    tracking = false;

    // On the buggy (unguarded) handler, setGameState is invoked here even
    // though the component is unmounted. With the isMounted guard it is
    // skipped. Zero post-unmount setter calls == guarded == correct.
    expect(setterCallsAfterUnmount).toBe(0);
  });

  it('does not invoke a state setter when a timer_tick arrives after unmount', async () => {
    const { unmount } = render(<GameProvider roomCode="ABCD" />);

    await waitFor(() => expect(socketCallbacks.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    unmount();
    tracking = true;

    // timer_tick calls setTimeRemaining with no guard on the buggy handler.
    act(() => {
      socketCallbacks.onMessage!(timerTick);
    });

    tracking = false;

    expect(setterCallsAfterUnmount).toBe(0);
  });

  it('still updates state normally while mounted (guard must not break the happy path)', async () => {
    render(<GameProvider roomCode="ABCD" />);

    await waitFor(() => expect(socketCallbacks.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    // While still mounted, a socket frame MUST drive a state update — this
    // guards against an over-broad fix that suppresses updates unconditionally.
    tracking = true;
    act(() => {
      socketCallbacks.onMessage!(gameStateUpdate);
    });
    tracking = false;

    expect(setterCallsAfterUnmount).toBeGreaterThan(0);
  });
});

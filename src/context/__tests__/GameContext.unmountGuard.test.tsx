import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// BUG-1 (bug_risk) reproduction — setState on an unmounted component.
//
// The socket message handler in GameContext (`handleMessage`) calls
// `setGameState` / `setTimeRemaining` for the `game_state_update`, `timer_tick`
// and `host_migrated` cases WITHOUT an `isMounted.current` guard. Other
// callbacks (`onConnect`, `onDisconnect`, the `error` case) ARE guarded, but
// these are not.
//
// If a WebSocket message arrives AFTER the provider has unmounted — a common
// race when navigating away mid-game while a frame is still in flight — React
// runs a state update on an unmounted component (a memory-leak smell).
//
// React 18 no longer prints the classic "state update on an unmounted
// component" console warning, so a warning-only assertion would pass even on
// the buggy code and prove nothing. Instead this test proves the bug
// DETERMINISTICALLY by spying on React.useState: it records every state setter
// the provider creates, then after unmount delivers a socket message and
// asserts NO setter runs. With the guard in place `handleMessage` returns
// early and no setter is called (PASS); without it `setGameState` /
// `setTimeRemaining` fire on the unmounted component (FAIL).
//
// Fix that makes this pass: add `if (!isMounted.current) return;` at the top
// of `handleMessage` in src/context/GameContext.tsx. (App-code change — out of
// this test's scope; this file is the reproducing regression guard.)
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

// Capture the socket callbacks so the test can deliver messages directly.
const connectOptions: {
  onMessage?: (m: GameSocketMessage) => void;
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
} = {};
const connectMock = vi.fn((options: typeof connectOptions) => {
  connectOptions.onMessage = options.onMessage;
  connectOptions.onConnect = options.onConnect;
  connectOptions.onDisconnect = options.onDisconnect;
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

// A minimal game_state_update payload matching what the backend broadcasts.
function gameStateUpdateMessage(): GameSocketMessage {
  return {
    type: 'game_state_update',
    payload: {
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'playing',
      currentRound: 3,
      players: {
        'player-1': {
          id: 'player-1',
          name: 'TestPlayer',
          isHost: true,
          board: { tiles: [{ id: 'tile-1', genre: 'House', status: 'complete' }] },
        },
      },
    },
  } as unknown as GameSocketMessage;
}

/**
 * Wrap React.useState so every state setter created during the provider's
 * lifetime is recorded. A window flag lets us count only the setters that fire
 * AFTER unmount (state updates during mount/effects are expected and ignored).
 */
function installUseStateProbe() {
  const realUseState = React.useState;
  let watching = false;
  let postUnmountSetterCalls = 0;

  const spy = vi.spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const [value, setValue] = (realUseState as typeof React.useState)(
      initial as never,
    );
    const wrapped = ((update: unknown) => {
      if (watching) postUnmountSetterCalls += 1;
      return (setValue as (u: unknown) => void)(update);
    }) as typeof setValue;
    return [value, wrapped];
  }) as typeof React.useState);

  return {
    startWatching: () => {
      watching = true;
    },
    get postUnmountSetterCalls() {
      return postUnmountSetterCalls;
    },
    restore: () => spy.mockRestore(),
  };
}

describe('GameContext — socket callback must not setState after unmount (BUG-1)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onMessage = undefined;
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('does not run a state update when a game_state_update arrives after unmount', async () => {
    const probe = installUseStateProbe();
    try {
      const { unmount } = render(<GameProvider roomCode="ABCD" />);

      // Wait for the socket to connect and register its onMessage handler.
      await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
      const deliver = connectOptions.onMessage!;

      // Tear the provider down — isMounted.current flips to false.
      unmount();

      // Only count state updates that happen from here on.
      probe.startWatching();

      // A late socket frame races in after unmount. Without the isMounted
      // guard, handleMessage calls setGameState on an unmounted component.
      act(() => {
        deliver(gameStateUpdateMessage());
      });

      expect(
        probe.postUnmountSetterCalls,
        'A socket game_state_update triggered a state update after unmount — ' +
          'add `if (!isMounted.current) return;` at the top of handleMessage.',
      ).toBe(0);

      // Secondary signal (React <18 emitted a console warning here).
      const unmountWarning = errorSpy.mock.calls.find((call) =>
        call.some(
          (arg) =>
            typeof arg === 'string' && /unmounted component|update on an unmounted/i.test(arg),
        ),
      );
      expect(unmountWarning).toBeUndefined();
    } finally {
      probe.restore();
    }
  });

  it('does not run a state update when a timer_tick arrives after unmount', async () => {
    const probe = installUseStateProbe();
    try {
      const { unmount } = render(<GameProvider roomCode="ABCD" />);

      await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
      const deliver = connectOptions.onMessage!;

      unmount();
      probe.startWatching();

      act(() => {
        deliver({
          type: 'timer_tick',
          payload: { timeRemaining: 42 },
        } as unknown as GameSocketMessage);
      });

      expect(
        probe.postUnmountSetterCalls,
        'A socket timer_tick triggered setTimeRemaining after unmount — ' +
          'add `if (!isMounted.current) return;` at the top of handleMessage.',
      ).toBe(0);
    } finally {
      probe.restore();
    }
  });
});

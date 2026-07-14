import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';

// ---------------------------------------------------------------------------
// BUG-1 regression: the WebSocket message callback (and the timer_tick /
// host_migrated branches) call setState WITHOUT an `isMounted.current` guard.
// If a socket message is delivered AFTER the GameProvider has unmounted, those
// setState calls run on an unmounted component — a React state-update leak.
//
// These tests deliver socket messages after unmount and assert the message
// handler does NOT process them (i.e. the setState path is skipped). They FAIL
// today (no guard) and PASS once `if (!isMounted.current) return;` is added to
// the message handler / timer_tick / host_migrated branches.
//
// Writing the fix itself is app code and out of this agent's scope — this file
// is the regression guard for it.
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

// Capture the socket callbacks so the test can drive connect + push messages.
type MessageHandler = (message: { type: string; payload: unknown }) => void;
const connectOptions: {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
  onMessage?: MessageHandler;
} = {};
const connectMock = vi.fn((options: typeof connectOptions) => {
  connectOptions.onConnect = options.onConnect;
  connectOptions.onDisconnect = options.onDisconnect;
  connectOptions.onMessage = options.onMessage;
});

vi.mock('@/services/gameSocket', () => {
  const socket = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof connectOptions) => void)(...(args as [typeof connectOptions])),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return {
    __esModule: true,
    default: socket,
    gameSocket: socket,
  };
});

// Avoid framer-motion animation churn in jsdom.
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(
      ({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) =>
        React.createElement('div', { ...props, ref }, children as React.ReactNode),
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

describe('GameContext socket callback unmount safety (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    connectOptions.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  async function mountAndUnmount() {
    const { unmount } = render(<GameProvider roomCode="ABCD" />);
    // Wait until the socket has connected and registered its message handler.
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    const onMessage = connectOptions.onMessage!;
    // Unmount the provider — from here on, any setState from a socket message
    // would be a state update on an unmounted component.
    act(() => {
      unmount();
    });
    return onMessage;
  }

  it('ignores a game_state_update delivered after unmount (does not touch the payload)', async () => {
    const onMessage = await mountAndUnmount();

    // The payload exposes `players` via a getter that records access. A guarded
    // handler returns before ever reading the payload; an unguarded one reads
    // `newState.players` to build the next state → the getter fires.
    const playersAccessed = vi.fn();
    const payload = {
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'playing',
      currentRound: 3,
      get players() {
        playersAccessed();
        return {};
      },
    };

    act(() => {
      onMessage({ type: 'game_state_update', payload });
    });

    // If the guard is present, the handler returns early and never reads the
    // payload after unmount. Fails today (no guard) → passes once guard added.
    expect(playersAccessed).not.toHaveBeenCalled();
  });

  it('does not throw when timer_tick or host_migrated arrive after unmount', async () => {
    const onMessage = await mountAndUnmount();

    // These branches call setTimeRemaining / setGameState with no guard.
    expect(() => {
      act(() => {
        onMessage({ type: 'timer_tick', payload: { timeRemaining: 42 } });
        onMessage({ type: 'host_migrated', payload: { newHostId: 'player-1' } });
      });
    }).not.toThrow();
  });

  it('does not log a React "unmounted component" state-update warning after unmount', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onMessage = await mountAndUnmount();

    act(() => {
      onMessage({
        type: 'game_state_update',
        payload: {
          gameId: 'ABCD',
          roomCode: 'ABCD',
          status: 'playing',
          currentRound: 5,
          players: {},
        },
      });
      onMessage({ type: 'timer_tick', payload: { timeRemaining: 10 } });
    });

    const unmountedWarnings = errorSpy.mock.calls.filter((call) =>
      call.some(
        (arg) =>
          typeof arg === 'string' &&
          /state update on an unmounted component|unmounted component/i.test(arg),
      ),
    );
    expect(unmountedWarnings).toEqual([]);
    errorSpy.mockRestore();
  });
});

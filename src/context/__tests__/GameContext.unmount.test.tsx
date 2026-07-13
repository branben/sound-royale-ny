import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider } from '../GameContext';
import type { GameSocketMessage } from '@/services/gameSocket';
import { useUser } from '../UserContext';

// Regression test for BUG-1 (bug_risk):
//   The socket `onMessage` handler in GameContext calls setState
//   (setGameState / setTimeRemaining) WITHOUT an
//   `if (!isMounted.current) return;` guard. If a socket message arrives
//   after the provider unmounts, React performs a state update on an
//   unmounted component.
//
// React 18 silently no-ops such updates (no console warning in jsdom), so a
// warning-based assertion can't detect the bug. Instead we wrap React.useState
// so every state SETTER call is recorded, then assert the message handler
// dispatches ZERO setState calls once the component is unmounted.
//
//   - Unguarded (buggy) handler: fires setGameState / setTimeRemaining after
//     unmount -> recorded dispatches > 0 -> these tests FAIL.
//   - Guarded (fixed) handler: `if (!isMounted.current) return;` short-circuits
//     -> zero dispatches after unmount -> these tests PASS.

// Mock the UserContext
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

// Capture the socket callbacks so the test can drive messages.
const connectOptions: {
  onMessage?: (message: GameSocketMessage) => void;
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

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () =>
        React.forwardRef(
          ({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLElement>) =>
            React.createElement('div', { ...props, ref }, children as React.ReactNode),
        ),
    },
  ),
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

// A socket game_state_update payload that would trigger setGameState.
const stateUpdateMessage = {
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

const timerTickMessage = {
  type: 'timer_tick',
  payload: { timeRemaining: 42 },
} as GameSocketMessage;

const hostMigratedMessage = {
  type: 'host_migrated',
  payload: { newHostId: 'player-1', newHostName: 'TestPlayer' },
} as GameSocketMessage;

// Wraps React.useState so every SETTER invocation is recorded while
// `recording` is on. Returns handles to start/stop recording and read the
// count, plus a restore fn.
function instrumentUseState() {
  const realUseState = React.useState.bind(React);
  let recording = false;
  const dispatches: unknown[] = [];
  const spy = vi.spyOn(React, 'useState').mockImplementation(((init: unknown) => {
    const [state, setState] = realUseState(init as never);
    const wrapped = (value: unknown) => {
      if (recording) dispatches.push(value);
      return (setState as (v: unknown) => void)(value);
    };
    return [state, wrapped] as unknown as [unknown, unknown];
  }) as unknown as typeof React.useState);
  return {
    start: () => {
      recording = true;
    },
    stop: () => {
      recording = false;
    },
    count: () => dispatches.length,
    restore: () => spy.mockRestore(),
  };
}

function macrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe('GameContext — no setState after unmount (BUG-1 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onMessage = undefined;
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  let instrument: ReturnType<typeof instrumentUseState> | undefined;
  afterEach(() => {
    instrument?.restore();
    instrument = undefined;
  });

  // Mount the provider, let the socket connect + initial fetch settle, then
  // unmount and drive the given post-unmount messages. Returns the number of
  // setState dispatches the handler made AFTER unmount.
  async function dispatchesAfterUnmount(messages: GameSocketMessage[]): Promise<number> {
    instrument = instrumentUseState();
    const { unmount } = render(<GameProvider roomCode="ABCD" />);

    // Wait for the socket to connect (onMessage registered) and the initial
    // mount fetch to complete so no legitimate mount-time updates remain.
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());
    await macrotask();

    const fireMessage = connectOptions.onMessage!;

    // Unmount — isMounted.current should now be false.
    unmount();

    // Only messages fired AFTER unmount count toward the assertion.
    instrument.start();
    for (const message of messages) {
      fireMessage(message);
    }
    await macrotask();
    instrument.stop();

    return instrument.count();
  }

  it('does not call setState when a game_state_update arrives after unmount', async () => {
    expect(await dispatchesAfterUnmount([stateUpdateMessage])).toBe(0);
  });

  it('does not call setState when a timer_tick arrives after unmount', async () => {
    expect(await dispatchesAfterUnmount([timerTickMessage])).toBe(0);
  });

  it('does not call setState when a host_migrated arrives after unmount', async () => {
    expect(await dispatchesAfterUnmount([hostMigratedMessage])).toBe(0);
  });

  it('does not call setState for any socket message after unmount', async () => {
    expect(
      await dispatchesAfterUnmount([
        timerTickMessage,
        stateUpdateMessage,
        hostMigratedMessage,
      ]),
    ).toBe(0);
  });
});

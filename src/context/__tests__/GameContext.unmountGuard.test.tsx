import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

/**
 * Regression test for BUG-1 (bug_risk):
 *
 * The GameContext WebSocket `onMessage` handler calls React state setters
 * (setGameState / setTimeRemaining) for `game_state_update`, `timer_tick`, and
 * `host_migrated` messages WITHOUT an `isMounted.current` guard. A socket
 * message that arrives after the provider unmounts therefore performs a state
 * update on an unmounted component (React 18 no longer prints the old console
 * warning, so this must be detected structurally, not via console output).
 *
 * Detection strategy: we wrap React's `useState` so every state setter created
 * by the rendered tree is tracked. After the provider unmounts we clear the
 * "mounted" flag; if a socket message then invokes ANY of those setters, the
 * component updated state after unmount — the BUG-1 defect.
 *
 * This test FAILS on the current (unguarded) code and PASSES once the handler
 * early-returns with `if (!isMounted.current) return;` before each setState.
 */

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

// Capture the socket onMessage callback so the test can drive a message
// AFTER the provider has unmounted.
const socketHandlers: {
  onMessage?: (message: GameSocketMessage) => void;
} = {};

const connectMock = vi.fn((options: { onMessage?: (m: GameSocketMessage) => void }) => {
  socketHandlers.onMessage = options.onMessage;
});

vi.mock('@/services/gameSocket', () => {
  const socket = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: { onMessage?: (m: GameSocketMessage) => void }) => void)(
        ...(args as [{ onMessage?: (m: GameSocketMessage) => void }]),
      ),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return { __esModule: true, default: socket, gameSocket: socket };
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

// --- useState tracking harness -------------------------------------------
// After unmount we flip `unmounted = true`. Any tracked setter invoked while
// `unmounted` is true is a post-unmount state update (the BUG-1 defect).
let unmounted = false;
let postUnmountCount = 0;

const realUseState = React.useState.bind(React);

beforeEach(() => {
  unmounted = false;
  postUnmountCount = 0;
});

// Wrap React.useState so every setter the tree creates is instrumented.
vi.spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
  const [value, setValue] = realUseState(initial as never);
  const wrapped = ((...args: unknown[]) => {
    if (unmounted) {
      postUnmountCount += 1;
    }
    return (setValue as (...a: unknown[]) => void)(...args);
  }) as typeof setValue;
  return [value, wrapped];
}) as typeof React.useState);

describe('GameContext unmount guard (BUG-1 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  async function mountAndGetHandler() {
    const { unmount } = render(<GameProvider roomCode="ABCD" />);
    await waitFor(() => expect(socketHandlers.onMessage).toBeTypeOf('function'));
    const handler = socketHandlers.onMessage!;
    // Let the initial mount fetch settle so its setState calls happen while
    // still mounted (they must NOT count against the post-unmount assertion).
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    return { handler, unmount };
  }

  function assertNoPostUnmountSetState() {
    expect(
      postUnmountCount,
      `A socket message after unmount invoked ${postUnmountCount} state setter(s), ` +
        `i.e. setState ran on an unmounted component. Add ` +
        `"if (!isMounted.current) return;" before the setState in the ` +
        `GameContext onMessage handler (BUG-1).`,
    ).toBe(0);
  }

  it('does not setState after unmount when a game_state_update arrives', async () => {
    const { handler, unmount } = await mountAndGetHandler();

    unmounted = true;
    unmount();

    act(() => {
      handler({
        type: 'game_state_update',
        payload: {
          gameId: 'ABCD',
          roomCode: 'ABCD',
          status: 'playing',
          players: {},
          currentRound: 5,
        } as GameSocketMessage['payload'],
      } as GameSocketMessage);
    });

    assertNoPostUnmountSetState();
  });

  it('does not setState after unmount when a timer_tick arrives', async () => {
    const { handler, unmount } = await mountAndGetHandler();

    unmounted = true;
    unmount();

    act(() => {
      handler({ type: 'timer_tick', payload: { timeRemaining: 42 } });
    });

    assertNoPostUnmountSetState();
  });

  it('does not setState after unmount when a host_migrated message arrives', async () => {
    const { handler, unmount } = await mountAndGetHandler();

    unmounted = true;
    unmount();

    act(() => {
      handler({
        type: 'host_migrated',
        payload: { newHostId: 'player-2', newHostName: 'Other' },
      });
    });

    assertNoPostUnmountSetState();
  });
});

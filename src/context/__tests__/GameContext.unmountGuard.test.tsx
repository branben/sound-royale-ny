import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// Regression test for BUG-1 (bug_risk):
//   The WebSocket `onMessage` handler in GameContext processes messages and
//   calls setState (setGameState / setTimeRemaining) for several message types.
//   If a socket message is delivered AFTER the GameProvider has unmounted, the
//   handler still runs its full body and updates state on an unmounted
//   component — a leak. React 18 no longer prints the classic
//   "setState on an unmounted component" warning, so this test asserts the
//   behavior deterministically instead of scraping console output.
//
//   The fix is an isMounted guard (`if (!isMounted.current) return;`) at the
//   TOP of the message handler, mirroring the guards already on the
//   fetch/reconnect paths. With the guard in place the handler returns before
//   it ever reads `message.payload`; without it the handler dereferences the
//   payload and runs its state-update path.
//
//   We detect that by making `payload` a getter that records access. After
//   unmount:
//     - guarded handler   → early return, payload NEVER read (0 accesses)
//     - unguarded handler → payload read while processing (>= 1 access)
//
//   => FAILS on the unguarded handler, PASSES once the guard lands.
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

// Capture the socket callbacks — crucially onMessage, which the reconnect
// suite does not exercise — so the test can deliver a message post-unmount.
const captured: {
  onMessage?: (m: GameSocketMessage) => void;
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
} = {};

const connectMock = vi.fn((options: typeof captured) => {
  captured.onMessage = options.onMessage;
  captured.onConnect = options.onConnect;
  captured.onDisconnect = options.onDisconnect;
});

const disconnectMock = vi.fn();

vi.mock('@/services/gameSocket', () => ({
  __esModule: true,
  default: {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof captured) => void)(...(args as [typeof captured])),
    disconnect: (...args: unknown[]) => disconnectMock(...args),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  },
  gameSocket: {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof captured) => void)(...(args as [typeof captured])),
    disconnect: (...args: unknown[]) => disconnectMock(...args),
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

// Build a message whose `payload` is a getter that counts how many times the
// handler dereferences it. A guarded handler returns before reading payload.
function probeMessage(
  type: GameSocketMessage['type'],
  payload: unknown,
): { message: GameSocketMessage; reads: () => number } {
  let count = 0;
  const message = {
    type,
    get payload() {
      count += 1;
      return payload;
    },
  } as unknown as GameSocketMessage;
  return { message, reads: () => count };
}

async function mountAndCaptureHandler() {
  const view = render(<GameProvider roomCode="ABCD" />);
  // Wait for the socket effect to register and capture onMessage.
  await waitFor(() => expect(captured.onMessage).toBeTypeOf('function'));
  // Let the initial mount fetch settle so no unrelated async is in flight.
  await waitFor(() => expect(getRoomMock).toHaveBeenCalled());
  return { view, deliver: captured.onMessage! };
}

describe('GameContext — no setState after unmount (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.onMessage = undefined;
    captured.onConnect = undefined;
    captured.onDisconnect = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('processes a game_state_update while mounted (control: handler is wired up)', async () => {
    const { deliver } = await mountAndCaptureHandler();

    const { message, reads } = probeMessage('game_state_update', {
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'playing',
      currentRound: 3,
      players: {
        'player-1': {
          id: 'player-1',
          name: 'TestPlayer',
          board: { tiles: [] },
        },
      },
    });

    act(() => {
      deliver(message);
    });

    // While mounted the handler must run and dereference the payload.
    expect(reads()).toBeGreaterThan(0);
  });

  it('does NOT process a game_state_update delivered after unmount', async () => {
    const { view, deliver } = await mountAndCaptureHandler();

    // Tear the provider down — the disconnect/navigation window.
    view.unmount();

    const { message, reads } = probeMessage('game_state_update', {
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'playing',
      currentRound: 3,
      players: {
        'player-1': {
          id: 'player-1',
          name: 'TestPlayer',
          board: { tiles: [] },
        },
      },
    });

    // A message already in flight now arrives after unmount.
    act(() => {
      deliver(message);
    });

    // Guarded handler returns before touching payload → no state update leak.
    expect(reads()).toBe(0);
  });

  it('does NOT process a timer_tick delivered after unmount', async () => {
    const { view, deliver } = await mountAndCaptureHandler();

    view.unmount();

    const { message, reads } = probeMessage('timer_tick', { timeRemaining: 42 });

    act(() => {
      deliver(message);
    });

    expect(reads()).toBe(0);
  });
});

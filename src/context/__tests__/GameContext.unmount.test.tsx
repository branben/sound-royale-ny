import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// BUG-1 guard: the WebSocket onMessage callback must not process a message /
// call setState after the GameProvider has unmounted. The real-world race is
// an in-flight socket frame that arrives just after the component tears down.
//
// The fix is an early `if (!isMounted.current) return;` at the TOP of the
// onMessage handler, before any payload is read or any setState runs.
//
// React 18 no longer emits a "setState on an unmounted component" warning, so
// we can't detect the leak by watching console.error. Instead we make the
// handler's WORK observable: each message payload is wrapped so that the very
// first property access the handler makes is recorded. With the guard, an
// unmounted handler returns immediately and NEVER touches the payload. Without
// the guard, the handler proceeds to read the payload (and would call setState
// on the dead component). Asserting "payload untouched after unmount" therefore
// fails without the guard and passes with it.
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

// Capture the socket callbacks so the test can drive onMessage directly.
const connectOptions: {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
  onMessage?: (m: GameSocketMessage) => void;
  onError?: (e: unknown) => void;
} = {};

const connectMock = vi.fn((options: typeof connectOptions) => {
  connectOptions.onConnect = options.onConnect;
  connectOptions.onDisconnect = options.onDisconnect;
  connectOptions.onMessage = options.onMessage;
  connectOptions.onError = options.onError;
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

// Wrap a payload so ANY property access on it is recorded. The onMessage
// handler reads at least one field of the payload for every message type it
// acts on (e.g. `message.payload.players`, `.timeRemaining`, `.newHostId`,
// `.message`). A guarded (post-unmount) handler returns before reading, so the
// tripwire stays untouched.
function tripwirePayload<T extends object>(payload: T): { payload: T; touched: () => boolean } {
  let wasTouched = false;
  const proxy = new Proxy(payload, {
    get(target, prop, receiver) {
      wasTouched = true;
      return Reflect.get(target, prop, receiver);
    },
  });
  return { payload: proxy as T, touched: () => wasTouched };
}

async function mountAndCaptureOnMessage() {
  const utils = render(<GameProvider roomCode="ABCD" />);
  await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
  return { ...utils, onMessage: connectOptions.onMessage! };
}

describe('GameContext — no setState after unmount (BUG-1 guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    connectOptions.onMessage = undefined;
    connectOptions.onError = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('processes a game_state_update while mounted (control: handler DOES run)', async () => {
    const { onMessage } = await mountAndCaptureOnMessage();

    const { payload, touched } = tripwirePayload({
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'playing',
      players: {},
      currentRound: 5,
    });

    act(() => {
      onMessage({ type: 'game_state_update', payload } as unknown as GameSocketMessage);
    });

    // While mounted, the handler must read the payload — proving the tripwire
    // actually detects handler execution (guards the test itself).
    expect(touched()).toBe(true);
  });

  it('does NOT process a game_state_update delivered after unmount', async () => {
    const { unmount, onMessage } = await mountAndCaptureOnMessage();

    // Unmount first — isMounted.current becomes false and the socket is torn down.
    unmount();

    const { payload, touched } = tripwirePayload({
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'playing',
      players: {},
      currentRound: 9,
    });

    // A stale in-flight frame arrives after unmount.
    act(() => {
      onMessage({ type: 'game_state_update', payload } as unknown as GameSocketMessage);
    });

    // Guard present → handler returned early → payload never touched.
    expect(touched()).toBe(false);
  });

  it('does NOT process a timer_tick delivered after unmount', async () => {
    const { unmount, onMessage } = await mountAndCaptureOnMessage();
    unmount();

    const { payload, touched } = tripwirePayload({ timeRemaining: 30 });
    act(() => {
      onMessage({ type: 'timer_tick', payload } as unknown as GameSocketMessage);
    });

    expect(touched()).toBe(false);
  });

  it('does NOT process a host_migrated delivered after unmount', async () => {
    const { unmount, onMessage } = await mountAndCaptureOnMessage();
    unmount();

    const { payload, touched } = tripwirePayload({ newHostId: 'player-1' });
    act(() => {
      onMessage({ type: 'host_migrated', payload } as unknown as GameSocketMessage);
    });

    expect(touched()).toBe(false);
  });

  it('does NOT process an error message delivered after unmount', async () => {
    const { unmount, onMessage } = await mountAndCaptureOnMessage();
    unmount();

    const { payload, touched } = tripwirePayload({ message: 'boom' });
    act(() => {
      onMessage({ type: 'error', payload } as unknown as GameSocketMessage);
    });

    expect(touched()).toBe(false);
  });
});

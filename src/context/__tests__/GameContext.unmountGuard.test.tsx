import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// Regression test for BUG-1 (bug_risk):
//   The GameContext WebSocket `onMessage` callback calls setState
//   (setGameState / setTimeRemaining) WITHOUT an `isMounted.current` guard.
//   If a socket message arrives after the provider has unmounted, React
//   performs a state update on an unmounted component — a stale-update /
//   memory-leak bug in production.
//
//   React 18 silently swallows post-unmount setState (no console warning), so
//   these tests instead observe the *handler body* directly: a payload whose
//   fields are getter-instrumented. A correctly GUARDED handler returns early
//   (`if (!isMounted.current) return;`) and never touches the payload after
//   unmount; the current UNGUARDED handler reads the payload and calls
//   setState. Each test asserts the handler does NOT process a message that
//   arrives after unmount.
//
//   Expected: FAILS against the unguarded callback, PASSES once the guard is
//   added at the top of `handleMessage`.
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
    {
      id: 'player-2',
      name: 'OtherPlayer',
      is_host: false,
      is_ready: false,
      tiles: [{ id: 'tile-2', genre: 'Techno', status: 'pending' as const }],
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

// Capture the socket callbacks so the test can drive messages directly.
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

vi.mock('@/services/gameSocket', () => {
  const impl = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof connectOptions) => void)(...(args as [typeof connectOptions])),
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

function StateReader() {
  const ctx = React.useContext(GameStateContext);
  if (!ctx) return null;
  return (
    <div>
      <div data-testid="status">{ctx.gameState.status}</div>
      <div data-testid="player-count">{Object.keys(ctx.gameState.players).length}</div>
      <div data-testid="current-round">{ctx.gameState.currentRound}</div>
    </div>
  );
}

/**
 * Build a game_state_update payload whose fields the handler reads only if it
 * proceeds past the unmount guard. `touched` flips true the moment the handler
 * dereferences the payload (i.e. it is processing the message).
 */
function makeInstrumentedGameStatePayload() {
  const marker = { touched: false };
  const payload = {} as Record<string, unknown>;
  for (const key of [
    'players',
    'gameId',
    'roomCode',
    'status',
    'matchType',
    'currentRound',
    'winner',
    'roundState',
    'spectatorCount',
    'eloDeltas',
  ]) {
    Object.defineProperty(payload, key, {
      enumerable: true,
      get() {
        marker.touched = true;
        return key === 'players' ? {} : undefined;
      },
    });
  }
  return { payload: payload as unknown as GameSocketMessage['payload'], marker };
}

describe('GameContext socket callback unmount guard (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onMessage = undefined;
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  async function mountAndGetHandler() {
    const rendered = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('2'));
    return { ...rendered, handleMessage: connectOptions.onMessage! };
  }

  it('ignores a game_state_update that arrives after unmount', async () => {
    const { unmount, handleMessage } = await mountAndGetHandler();

    unmount();

    const { payload, marker } = makeInstrumentedGameStatePayload();
    handleMessage({ type: 'game_state_update', payload });

    // A guarded handler returns before ever reading the payload.
    expect(marker.touched).toBe(false);
  });

  it('ignores a timer_tick that arrives after unmount', async () => {
    const { unmount, handleMessage } = await mountAndGetHandler();

    unmount();

    let read = false;
    const payload = {} as { timeRemaining: number };
    Object.defineProperty(payload, 'timeRemaining', {
      enumerable: true,
      get() {
        read = true;
        return 42;
      },
    });

    handleMessage({ type: 'timer_tick', payload });

    // A guarded handler never reads timeRemaining after unmount.
    expect(read).toBe(false);
  });

  it('ignores a host_migrated message that arrives after unmount', async () => {
    const { unmount, handleMessage } = await mountAndGetHandler();

    unmount();

    let read = false;
    const payload = { newHostName: 'OtherPlayer' } as {
      newHostId: string;
      newHostName: string;
    };
    Object.defineProperty(payload, 'newHostId', {
      enumerable: true,
      get() {
        read = true;
        return 'player-2';
      },
    });

    handleMessage({ type: 'host_migrated', payload });

    expect(read).toBe(false);
  });

  it('still processes socket messages normally while mounted (guard is not over-broad)', async () => {
    const { handleMessage } = await mountAndGetHandler();

    await waitFor(() => expect(screen.getByTestId('current-round').textContent).toBe('2'));

    act(() => {
      handleMessage({
        type: 'game_state_update',
        payload: {
          gameId: 'ABCD',
          roomCode: 'ABCD',
          status: 'voting',
          players: {},
          currentRound: 5,
        } as unknown as GameSocketMessage['payload'],
      });
    });

    // While mounted the update IS applied — the guard must only block post-unmount.
    await waitFor(() => expect(screen.getByTestId('current-round').textContent).toBe('5'));
    expect(screen.getByTestId('status').textContent).toBe('voting');
  });
});

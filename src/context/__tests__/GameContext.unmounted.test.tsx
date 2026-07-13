import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// Regression test for BUG-1 (bug_risk):
//
//   The GameContext WebSocket `onMessage` handler processes socket messages
//   and calls setState (setGameState / setTimeRemaining) WITHOUT an
//   `isMounted.current` guard at the top of the handler. When a socket message
//   arrives after the provider has unmounted — a real race, since the socket
//   teardown in the effect cleanup is async and an in-flight message can land
//   after React tears the component down — the handler still runs its work and
//   performs a state update on an unmounted component.
//
//   React 18 no longer emits the old "Can't perform a React state update on an
//   unmounted component" console warning, so a warning-spy cannot catch this.
//   Instead this test proves the bug DETERMINISTICALLY: it delivers a
//   `game_state_update` whose `payload.players` is an accessor that records
//   when it is read. `handleMessage` reads `payload.players` while building the
//   next state, so:
//     - BUGGY (no guard): the handler runs after unmount → the accessor fires.
//     - FIXED  (guard):   `if (!isMounted.current) return;` short-circuits the
//                         handler before it touches the payload → no access.
//
//   FIX: add `if (!isMounted.current) return;` as the first line of the
//   `handleMessage` callback in GameContext.
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
  return <div data-testid="status">{ctx.gameState.status}</div>;
}

// Build a game_state_update payload whose `players` field is an accessor that
// records every read. `handleMessage` reads `payload.players` while it builds
// the next state — so a read is a proxy for "the handler ran and reached the
// setState work". A read after unmount == the bug.
function makeProbedUpdate() {
  const access = vi.fn();
  const realPlayers = { 'player-1': { id: 'player-1', name: 'TestPlayer' } };
  const payload = {
    gameId: 'ABCD',
    roomCode: 'ABCD',
    status: 'voting',
    currentRound: 2,
    get players() {
      access();
      return realPlayers;
    },
  };
  return {
    access,
    message: { type: 'game_state_update', payload } as unknown as GameSocketMessage,
  };
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

  async function renderAndCaptureSocket() {
    const view = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );
    // Wait until the socket handler has been registered by the effect.
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    return view;
  }

  it('processes a game_state_update while mounted (baseline: handler runs)', async () => {
    await renderAndCaptureSocket();
    const onMessage = connectOptions.onMessage!;
    const { access, message } = makeProbedUpdate();

    act(() => onMessage(message));

    // While mounted the handler must run to completion — it reads the payload
    // and applies the new state.
    expect(access).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('voting'));
  });

  it('does NOT process a game_state_update after unmount (no setState on unmounted component)', async () => {
    const { unmount } = await renderAndCaptureSocket();
    const onMessage = connectOptions.onMessage!;
    const { access, message } = makeProbedUpdate();

    // Unmount the provider — the socket message is still "in flight".
    unmount();

    // Deliver the message after unmount. With the isMounted guard the handler
    // must short-circuit before touching the payload; without it, the handler
    // runs and setState fires on an unmounted component.
    act(() => onMessage(message));

    expect(
      access,
      'game_state_update was processed after unmount — the handler reached the ' +
        'setState path on an unmounted component. Add `if (!isMounted.current) return;` ' +
        'as the first line of handleMessage.',
    ).not.toHaveBeenCalled();
  });

  it('does NOT process a host_migrated after unmount', async () => {
    const { unmount } = await renderAndCaptureSocket();
    const onMessage = connectOptions.onMessage!;

    const access = vi.fn();
    const message = {
      type: 'host_migrated',
      get payload() {
        access();
        return { newHostId: 'player-1' };
      },
    } as unknown as GameSocketMessage;

    unmount();
    act(() => onMessage(message));

    expect(
      access,
      'host_migrated was processed after unmount — handleMessage did not short-circuit.',
    ).not.toHaveBeenCalled();
  });

  it('does NOT process a timer_tick after unmount', async () => {
    const { unmount } = await renderAndCaptureSocket();
    const onMessage = connectOptions.onMessage!;

    const access = vi.fn();
    const message = {
      type: 'timer_tick',
      get payload() {
        access();
        return { timeRemaining: 42 };
      },
    } as unknown as GameSocketMessage;

    unmount();
    act(() => onMessage(message));

    expect(
      access,
      'timer_tick was processed after unmount — handleMessage did not short-circuit.',
    ).not.toHaveBeenCalled();
  });
});

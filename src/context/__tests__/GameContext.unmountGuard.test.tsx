import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';

// ---------------------------------------------------------------------------
// BUG-1 regression: the WebSocket message handler (onMessage) must NOT run its
// state-updating body after the component has unmounted. Without an
// `if (!isMounted.current) return;` guard at the top of handleMessage, an
// in-flight socket frame that arrives after GameProvider unmounts (before the
// socket teardown completes) calls setGameState/setTimeRemaining on an
// unmounted component ("Can't perform a React state update on an unmounted
// component").
//
// React 18 no longer logs a console warning for post-unmount setState, so we
// cannot assert on console output. Instead we detect whether the handler body
// executed at all: each test delivers a message whose payload exposes a getter
// tripwire on the FIRST property the handler reads for that message type. If
// the guard is present, handleMessage early-returns and never touches the
// payload (tripwire stays false). If the guard is missing, the body reads the
// payload and proceeds to setState (tripwire flips true).
//
// This test FAILS on the current (unguarded) code and PASSES once the guard is
// added — a true regression guard for BUG-1.
// ---------------------------------------------------------------------------

vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

const getRoomMock = vi.fn().mockResolvedValue({
  code: 'ABCD',
  status: 'playing',
  players: [{ id: 'player-1', name: 'TestPlayer', board: { tiles: [] } }],
  current_round: 1,
});

vi.mock('@/services/api', () => ({
  roomApi: {
    getRoom: (...args: unknown[]) => getRoomMock(...(args as [string])),
  },
  gameApi: {},
  getStoredAccessToken: vi.fn(() => null),
  normalizeRoomWinner: vi.fn(() => undefined),
}));

// Capture the socket callbacks so the test can drive an inbound message.
const connectOptions: { onMessage?: (m: unknown) => void } = {};
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

/**
 * Mount GameProvider, wait for effects to register the socket, capture the
 * onMessage handler, then unmount. Returns the captured handler so the test
 * can deliver a post-unmount message.
 */
async function mountThenUnmount() {
  const utils = render(
    <GameProvider roomCode="ABCD">
      <div />
    </GameProvider>,
  );
  // Let the mount effects run so gameSocket.connect() registers onMessage.
  await act(async () => {
    await Promise.resolve();
  });
  expect(connectOptions.onMessage).toBeTypeOf('function');
  const onMessage = connectOptions.onMessage!;

  utils.unmount();

  return onMessage;
}

describe('GameContext WebSocket handler unmount guard (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onMessage = undefined;
    getRoomMock.mockResolvedValue({
      code: 'ABCD',
      status: 'playing',
      players: [{ id: 'player-1', name: 'TestPlayer', board: { tiles: [] } }],
      current_round: 1,
    });
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('does not process a game_state_update after unmount', async () => {
    const onMessage = await mountThenUnmount();

    let handlerBodyRan = false;
    // `players` is the first payload field the game_state_update branch reads.
    const payload: Record<string, unknown> = {};
    Object.defineProperty(payload, 'players', {
      get() {
        handlerBodyRan = true;
        return {};
      },
    });

    // Delivering the message must be a no-op after unmount.
    expect(() => onMessage({ type: 'game_state_update', payload })).not.toThrow();
    await Promise.resolve();

    expect(handlerBodyRan).toBe(false);
  });

  it('does not process a timer_tick after unmount', async () => {
    const onMessage = await mountThenUnmount();

    let handlerBodyRan = false;
    const payload: Record<string, unknown> = {};
    Object.defineProperty(payload, 'timeRemaining', {
      get() {
        handlerBodyRan = true;
        return 42;
      },
    });

    expect(() => onMessage({ type: 'timer_tick', payload })).not.toThrow();
    await Promise.resolve();

    expect(handlerBodyRan).toBe(false);
  });

  it('does not process a host_migrated after unmount', async () => {
    const onMessage = await mountThenUnmount();

    let handlerBodyRan = false;
    const payload: Record<string, unknown> = {};
    Object.defineProperty(payload, 'newHostId', {
      get() {
        handlerBodyRan = true;
        return 'player-2';
      },
    });

    expect(() => onMessage({ type: 'host_migrated', payload })).not.toThrow();
    await Promise.resolve();

    expect(handlerBodyRan).toBe(false);
  });
});

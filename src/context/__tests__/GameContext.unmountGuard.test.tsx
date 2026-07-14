/**
 * BUG-1 reproduction — socket callback calls setState without an isMounted guard.
 *
 * `GameProvider`'s WebSocket `onMessage` handler (in GameContext.tsx) updates
 * React state for `game_state_update`, `timer_tick`, and `host_migrated`
 * messages WITHOUT first checking `isMounted.current`. If a socket frame
 * arrives after the provider has unmounted (a very common race during
 * navigation / reconnect teardown), the handler runs its full mapping and calls
 * `setGameState` / `setTimeRemaining` on an unmounted component — the classic
 * "setState on an unmounted component" leak. (Only the `error` case is
 * currently guarded.)
 *
 * React 18 no longer emits the old "Can't perform a React state update on an
 * unmounted component" console warning, so we cannot detect the bug by spying
 * on console.error. Instead we drive a message through the captured `onMessage`
 * handler AFTER unmount and observe whether the handler still touches the
 * message payload. A correctly guarded handler returns early on
 * `!isMounted.current` and never reads the payload; the buggy handler reads it
 * (to build the next state) and calls a state setter.
 *
 * Expected behavior once the fix (`if (!isMounted.current) return;` at the top
 * of handleMessage) lands:
 *   - FAILS on current code (payload is accessed after unmount).
 *   - PASSES once the guard short-circuits the handler.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// --- Mock the UserContext ---------------------------------------------------
vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// --- Mock the API module ----------------------------------------------------
const mockRoomResponse = {
  code: 'ABCD',
  status: 'playing',
  players: [],
  current_round: 1,
};
const getRoomMock = vi.fn().mockResolvedValue(mockRoomResponse);

vi.mock('@/services/api', () => ({
  roomApi: {
    getRoom: (...args: unknown[]) => getRoomMock(...(args as [string])),
  },
  gameApi: {},
  getStoredAccessToken: vi.fn(() => null),
  normalizeRoomWinner: vi.fn(() => undefined),
}));

// --- Mock gameSocket, capturing the onMessage handler so the test can drive
//     a frame AFTER the provider unmounts. -----------------------------------
const capture: { onMessage?: (m: GameSocketMessage) => void } = {};
const connectMock = vi.fn((options: { onMessage?: (m: GameSocketMessage) => void }) => {
  capture.onMessage = options.onMessage;
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

// --- Mock framer-motion to avoid animation issues in jsdom ------------------
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

/**
 * Wraps a message payload in a Proxy that records whether ANY property was
 * read. A guarded handler returns before reading the payload, so `accessed`
 * stays false; the buggy handler reads the payload to compute the next state.
 */
function trackingPayload<T extends object>(payload: T): { payload: T; wasAccessed: () => boolean } {
  let accessed = false;
  const proxy = new Proxy(payload, {
    get(target, prop, receiver) {
      accessed = true;
      return Reflect.get(target, prop, receiver);
    },
  });
  return { payload: proxy, wasAccessed: () => accessed };
}

async function mountAndCaptureHandler() {
  const utils = render(
    <GameProvider roomCode="ABCD">
      <div data-testid="child" />
    </GameProvider>,
  );
  // The socket connect() runs in an effect — wait for the handler to register.
  await waitFor(() => expect(capture.onMessage).toBeTypeOf('function'));
  return utils;
}

describe('GameContext — socket onMessage must not setState after unmount (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capture.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('ignores a game_state_update frame that arrives after unmount', async () => {
    const { unmount } = await mountAndCaptureHandler();
    const handler = capture.onMessage!;

    const { payload, wasAccessed } = trackingPayload({
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'playing',
      players: {},
      currentRound: 1,
    });

    unmount();

    // Deliver a late socket frame to the now-unmounted provider.
    act(() => {
      handler({ type: 'game_state_update', payload } as unknown as GameSocketMessage);
    });

    // A guarded handler short-circuits on !isMounted.current and never reads
    // the payload to build/apply new state. The buggy (unguarded) handler does.
    expect(wasAccessed()).toBe(false);
  });

  it('ignores a timer_tick frame that arrives after unmount', async () => {
    const { unmount } = await mountAndCaptureHandler();
    const handler = capture.onMessage!;

    const { payload, wasAccessed } = trackingPayload({ timeRemaining: 42 });

    unmount();

    act(() => {
      handler({ type: 'timer_tick', payload } as unknown as GameSocketMessage);
    });

    expect(wasAccessed()).toBe(false);
  });

  it('ignores a host_migrated frame that arrives after unmount', async () => {
    const { unmount } = await mountAndCaptureHandler();
    const handler = capture.onMessage!;

    const { payload, wasAccessed } = trackingPayload({
      newHostId: 'player-2',
      newHostName: 'OtherPlayer',
    });

    unmount();

    act(() => {
      handler({ type: 'host_migrated', payload } as unknown as GameSocketMessage);
    });

    expect(wasAccessed()).toBe(false);
  });

  it('still processes a game_state_update frame while mounted (guard must not over-block)', async () => {
    await mountAndCaptureHandler();
    const handler = capture.onMessage!;

    const { payload, wasAccessed } = trackingPayload({
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'playing',
      players: {},
      currentRound: 5,
    });

    // No unmount here — the provider is live, so the handler MUST process the
    // frame (reads the payload). This guards against a fix that blocks always.
    act(() => {
      handler({ type: 'game_state_update', payload } as unknown as GameSocketMessage);
    });

    expect(wasAccessed()).toBe(true);
  });
});

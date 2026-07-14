import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';

/**
 * Regression guard for BUG-1 (bug_risk):
 *
 *   The WebSocket message callback (`handleMessage` inside GameContext) branches
 *   on `message.type` and then calls React setState (setGameState / setTimeRemaining
 *   / setError) using `message.payload`. If a socket message arrives AFTER the
 *   provider has unmounted, that setState fires on an unmounted component —
 *   a classic "setState on unmounted component" leak.
 *
 *   The fix is a one-line early return at the top of `handleMessage`:
 *       if (!isMounted.current) return;
 *
 * Why this test is an honest red/green guard (and does NOT rely on console.error):
 *
 *   React 18.3 (this repo's version) REMOVED the "state update on an unmounted
 *   component" warning, so a console-spy assertion would silently pass and guard
 *   nothing. Instead, we detect the bug structurally: we hand `handleMessage` a
 *   message whose `payload` is a booby-trapped GETTER that records every access.
 *
 *     - While MOUNTED  -> the handler reaches into `message.payload` (baseline).
 *     - After UNMOUNT  -> a guarded handler returns BEFORE the switch, so
 *                          `payload` is never touched.
 *
 *   Against the current (unguarded) code: the baseline passes and the two
 *   "after unmount" assertions FAIL (payload is read -> setState-on-unmounted
 *   is exercised). With `if (!isMounted.current) return;` added, all pass.
 *
 *   Writing the fix itself is app code and out of this agent's scope — this
 *   file is the regression guard for it.
 */

// ---------------------------------------------------------------------------
// Mocks — mirror the harness used by GameContext.reconnect.test.tsx
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

// Capture the onMessage callback registered with gameSocket.connect so the test
// can drive incoming WS messages directly (both while mounted and after unmount).
const captured: {
  onMessage?: (message: unknown) => void;
} = {};

const connectMock = vi.fn((options: { onMessage?: (m: unknown) => void }) => {
  captured.onMessage = options.onMessage;
});

vi.mock('@/services/gameSocket', () => {
  const api = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: { onMessage?: (m: unknown) => void }) => void)(
        ...(args as [{ onMessage?: (m: unknown) => void }]),
      ),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return { __esModule: true, default: api, gameSocket: api };
});

// Avoid framer-motion animation noise in jsdom.
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
 * Build a `timer_tick` message whose `payload` is a getter that records access.
 * `timer_tick` is used because its handler reads `message.payload.timeRemaining`
 * and calls setState (`setTimeRemaining`) with no other side effects — the
 * minimal path that exercises the bug.
 */
function makeProbedTimerTick() {
  let payloadReads = 0;
  const message = {
    type: 'timer_tick' as const,
    get payload() {
      payloadReads += 1;
      return { timeRemaining: 42 };
    },
  };
  return {
    message,
    reads: () => payloadReads,
  };
}

// ---------------------------------------------------------------------------

describe('GameContext — no setState after unmount (BUG-1 guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('baseline: while mounted, an incoming socket message IS processed (payload is read)', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <div />
      </GameProvider>,
    );

    // The message-handling effect registers onMessage via gameSocket.connect.
    await waitFor(() => expect(captured.onMessage).toBeTypeOf('function'));

    const probe = makeProbedTimerTick();
    captured.onMessage!(probe.message);

    // Mounted -> handler runs the switch and reads payload.
    expect(probe.reads()).toBeGreaterThan(0);
  });

  it('after unmount, an incoming socket message must NOT be processed (payload untouched)', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <div />
      </GameProvider>,
    );

    await waitFor(() => expect(captured.onMessage).toBeTypeOf('function'));

    // Unmount the provider — isMounted.current should now be false.
    unmount();

    const probe = makeProbedTimerTick();
    // Simulate a late socket message arriving after teardown.
    captured.onMessage!(probe.message);

    // A guarded handler returns before the switch -> payload never read ->
    // no setState on the unmounted component. FAILS against unguarded code.
    expect(probe.reads()).toBe(0);
  });

  it('after unmount, a game_state_update message must NOT reach setState either', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <div />
      </GameProvider>,
    );

    await waitFor(() => expect(captured.onMessage).toBeTypeOf('function'));
    unmount();

    let payloadReads = 0;
    const message = {
      type: 'game_state_update' as const,
      get payload() {
        payloadReads += 1;
        return { players: {}, status: 'playing', currentRound: 3 };
      },
    };

    captured.onMessage!(message);

    // Guarded handler returns before the switch -> the game_state_update branch
    // never dereferences payload and never calls setGameState post-unmount.
    expect(payloadReads).toBe(0);
  });
});

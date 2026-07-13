/**
 * Regression test for BUG-1 (bug_risk):
 *
 *   "Socket callback calls setState without an isMounted guard → setState on
 *    unmounted component."
 *
 * GameContext subscribes to the game WebSocket via `gameSocket.connect({ onMessage })`.
 * When the provider unmounts, the effect cleanup sets `isMounted.current = false`
 * and disconnects the socket. But an in-flight / late-delivered socket frame can
 * still invoke the retained `onMessage` callback AFTER unmount. Several branches
 * of that handler update state WITHOUT guarding on `isMounted.current`:
 *
 *   - `game_state_update` → setGameState(...)
 *   - `timer_tick`        → setTimeRemaining(...)
 *   - `host_migrated`     → setGameState(...)
 *
 * Calling a state setter on an unmounted component is the "setState on an
 * unmounted component" hazard. (React 18 no longer prints the old console
 * warning for this, so this test does NOT rely on a console message.)
 *
 * How the bug is detected here:
 *   Each socket frame's `payload` is instrumented so the very field the branch
 *   reads is a getter that records access. On the CURRENT (buggy) code the
 *   handler runs the branch body after unmount and touches that field. Once the
 *   fix adds `if (!isMounted.current) return;` at the top of the message
 *   handler, the branch never runs after unmount, the payload field is never
 *   read, and no state setter is called.
 *
 * This test is written to FAIL on the current (unguarded) code and PASS once the
 * early return is added to the socket message callback. It is scoped strictly to
 * verifying the fix — it does not modify app code.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// A hoisted holder so the (hoisted) vi.mock factory and the test body can share
// the captured onMessage callback without a TDZ error.
const socketHarness = vi.hoisted(() => {
  const captured: { onMessage?: (m: unknown) => void } = {};
  const connect = (options: { onMessage?: (m: unknown) => void }) => {
    captured.onMessage = options.onMessage;
  };
  const api = {
    connect,
    disconnect: () => {},
    send: () => {},
    isConnected: () => false,
  };
  return { captured, api };
});

// Mock the UserContext
vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// Mock the API module — getRoom returns a minimal authoritative room snapshot.
const mockRoomResponse = {
  code: 'ABCD',
  status: 'playing',
  players: [{ id: 'player-1', name: 'TestPlayer', is_host: true, board: { tiles: [] } }],
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

vi.mock('@/services/gameSocket', () => ({
  __esModule: true,
  default: socketHarness.api,
  gameSocket: socketHarness.api,
}));

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

/**
 * Build a socket frame whose payload records whether the handler read the field
 * that its branch touches. `touched()` returns true iff the message handler ran
 * the branch body (i.e. did NOT early-return because the component is unmounted).
 */
function instrumentedFrame(
  type: string,
  probeField: string,
  probeValue: unknown,
  extra: Record<string, unknown> = {},
) {
  let touched = false;
  const payload: Record<string, unknown> = { ...extra };
  Object.defineProperty(payload, probeField, {
    enumerable: true,
    configurable: true,
    get() {
      touched = true;
      return probeValue;
    },
  });
  const message = { type, payload } as unknown as GameSocketMessage;
  return { message, touched: () => touched };
}

describe('GameContext — no setState after unmount (BUG-1 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketHarness.captured.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  /**
   * Render, capture onMessage, unmount, then deliver a late frame. Returns the
   * probe so the caller can assert the branch body did NOT run after unmount.
   */
  async function deliverAfterUnmount(frame: { message: GameSocketMessage; touched: () => boolean }) {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <div data-testid="child" />
      </GameProvider>,
    );

    // Ensure the socket effect ran and captured the onMessage callback.
    await waitFor(() => expect(socketHarness.captured.onMessage).toBeTypeOf('function'));

    // Unmount the provider — effect cleanup sets isMounted.current = false.
    unmount();

    // A late/in-flight socket frame arrives AFTER unmount. It must be handled
    // without throwing regardless of the guard.
    expect(() => socketHarness.captured.onMessage!(frame.message)).not.toThrow();

    return frame;
  }

  it('ignores a game_state_update frame that arrives after unmount (no setState)', async () => {
    // The game_state_update branch reads `payload.players` before setGameState.
    const frame = instrumentedFrame(
      'game_state_update',
      'players',
      { 'player-1': { name: 'TestPlayer', board: { tiles: [] } } },
      { gameId: 'ABCD', roomCode: 'ABCD', status: 'playing', currentRound: 3 },
    );

    await deliverAfterUnmount(frame);

    expect(
      frame.touched(),
      'game_state_update handler ran after unmount (read payload.players and called setGameState). ' +
        'Add `if (!isMounted.current) return;` to the socket message handler.',
    ).toBe(false);
  });

  it('ignores a timer_tick frame that arrives after unmount (no setState)', async () => {
    // The timer_tick branch reads `payload.timeRemaining` for setTimeRemaining.
    const frame = instrumentedFrame('timer_tick', 'timeRemaining', 42);

    await deliverAfterUnmount(frame);

    expect(
      frame.touched(),
      'timer_tick handler ran after unmount (read payload.timeRemaining and called setTimeRemaining). ' +
        'Add `if (!isMounted.current) return;` to the socket message handler.',
    ).toBe(false);
  });

  it('ignores a host_migrated frame that arrives after unmount (no setState)', async () => {
    // The host_migrated branch destructures `payload.newHostId` before setGameState.
    const frame = instrumentedFrame('host_migrated', 'newHostId', 'player-1');

    await deliverAfterUnmount(frame);

    expect(
      frame.touched(),
      'host_migrated handler ran after unmount (read payload.newHostId and called setGameState). ' +
        'Add `if (!isMounted.current) return;` to the socket message handler.',
    ).toBe(false);
  });
});

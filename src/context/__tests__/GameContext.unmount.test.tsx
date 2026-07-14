import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// Regression guard for BUG-1 (bug_risk):
//
//   The WebSocket onMessage callback (`handleMessage` in GameContext) calls
//   setState (setGameState / setTimeRemaining) when a socket message arrives.
//   If a message is delivered AFTER the provider has unmounted, the callback
//   still runs and performs setState on an unmounted component.
//
//   The fix is a one-line early return at the top of `handleMessage`:
//       if (!isMounted.current) return;
//
// This test is a deterministic red/green guard that does NOT rely on React's
// "state update on an unmounted component" warning — React 18.3 (this repo)
// removed that warning, so a console-spy assertion would silently pass and
// guard nothing. Instead it uses a booby-trapped `payload` getter that records
// whether the handler reached the point of reading `message.payload`:
//
//   - While MOUNTED  -> handler reads payload (baseline sanity check passes)
//   - After UNMOUNT  -> a guarded handler returns before the switch, so payload
//                       is NEVER read. Without the guard, payload IS read and
//                       the setState-on-unmounted-component path is exercised.
//
// Both message types exercised below (`timer_tick` -> setTimeRemaining and
// `game_state_update` -> setGameState) hit setState WITHOUT an inner mount
// guard, so each test genuinely flips from red (unguarded code) to green
// (with the top-level guard).
// ---------------------------------------------------------------------------

// Mock the UserContext.
vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// Mock the API module — getRoom returns a minimal authoritative snapshot so the
// provider mounts cleanly.
const mockRoomResponse = {
  code: 'ABCD',
  status: 'playing',
  players: [{ id: 'player-1', name: 'TestPlayer', board: { tiles: [] } }],
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

// Capture the socket onMessage handler so the test can deliver messages on demand.
const socket: { onMessage?: (m: GameSocketMessage) => void } = {};
const connectMock = vi.fn((options: { onMessage?: (m: GameSocketMessage) => void }) => {
  socket.onMessage = options.onMessage;
});
const disconnectMock = vi.fn();

vi.mock('@/services/gameSocket', () => {
  const impl = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: Record<string, unknown>) => void)(
        ...(args as [Record<string, unknown>]),
      ),
    disconnect: (...args: unknown[]) => disconnectMock(...args),
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

/**
 * Build a message whose `payload` is a getter that flips `probe.read = true`
 * the first time it is accessed. `handleMessage` reads `message.payload` inside
 * each case, so any handler that reaches the switch trips the probe.
 */
function makeProbedMessage(type: GameSocketMessage['type'], payload: unknown) {
  const probe = { read: false };
  const message = {
    type,
    get payload() {
      probe.read = true;
      return payload;
    },
  } as unknown as GameSocketMessage;
  return { probe, message };
}

/** Render the provider and wait until the socket has registered its handler. */
async function mountAndConnect() {
  const utils = render(<GameProvider roomCode="ABCD" />);
  await waitFor(() => expect(socket.onMessage).toBeTypeOf('function'));
  return utils;
}

describe('GameContext — no setState after unmount (BUG-1 regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socket.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('baseline: while mounted, a socket message IS processed (payload is read)', async () => {
    await mountAndConnect();

    const { probe, message } = makeProbedMessage('timer_tick', { timeRemaining: 42 });
    act(() => {
      socket.onMessage!(message);
    });

    // The mounted handler reaches the switch and reads payload — proving the
    // probe actually fires when the handler runs (sanity check for the guard
    // assertions below).
    expect(probe.read).toBe(true);
  });

  it('after unmount, a delayed timer_tick does not reach setTimeRemaining (no setState on unmounted component)', async () => {
    const { unmount } = await mountAndConnect();

    // Grab the handler the socket still holds, then unmount — this mirrors a
    // real WS message arriving in the disconnect window before socket teardown.
    const handler = socket.onMessage!;
    unmount();

    const { probe, message } = makeProbedMessage('timer_tick', { timeRemaining: 42 });
    handler(message);

    // A guarded handler bails out on `!isMounted.current` BEFORE the switch, so
    // it never touches `message.payload`. If this fails (payload was read), the
    // handler ran to completion after unmount and called setTimeRemaining on an
    // unmounted component — exactly BUG-1.
    expect(probe.read).toBe(false);
  });

  it('after unmount, a delayed game_state_update does not reach setGameState', async () => {
    const { unmount } = await mountAndConnect();

    const handler = socket.onMessage!;
    unmount();

    // game_state_update reads message.payload then calls setGameState with no
    // inner mount guard — another unguarded setState path.
    const { probe, message } = makeProbedMessage('game_state_update', { players: {} });
    handler(message);

    expect(probe.read).toBe(false);
  });
});

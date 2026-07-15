import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// Regression guard for BUG-1 (bug_risk):
//   The socket message callback (`handleMessage`) reads `message.payload` and
//   calls setState inside each case branch. Without an isMounted guard at the
//   top of the handler, a socket message that arrives AFTER the component has
//   unmounted still reads the payload and calls setState — the classic
//   "setState on an unmounted component" bug.
//
//   React 18.3 (this repo) removed the "state update on an unmounted
//   component" console warning, so a console-spy assertion would silently pass
//   and guard nothing. Instead this test makes the assertion deterministic:
//   `message.payload` is a booby-trapped getter that records every access.
//     - While MOUNTED  → the handler reads payload (baseline: proves the probe
//       fires and the switch runs).
//     - After UNMOUNT  → a *guarded* handler (`if (!isMounted.current) return;`
//       at the top) must return before the switch, so payload is NEVER read.
//
//   Against the current (unguarded) code the two "after unmount" assertions
//   FAIL (payload IS read). With the one-line fix at the top of handleMessage
//   they PASS.
// ---------------------------------------------------------------------------

vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// getRoom resolves a minimal room so the provider's mount effect settles.
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

// Capture the onMessage handler the provider registers so the test can drive
// socket messages directly.
const connectOptions: { onMessage?: (m: GameSocketMessage) => void } = {};
const connectMock = vi.fn((options: { onMessage?: (m: GameSocketMessage) => void }) => {
  connectOptions.onMessage = options.onMessage;
});

vi.mock('@/services/gameSocket', () => {
  const api = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof connectOptions) => void)(...(args as [typeof connectOptions])),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return { __esModule: true, default: api, gameSocket: api };
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

// Build a `timer_tick` message whose `payload` is a getter that flips a flag
// the moment it is accessed. `timer_tick` is used because its case reads a
// single scalar (`payload.timeRemaining`) and calls setState — the exact
// setState-after-unmount path the guard protects.
function makeProbedTimerTick(onPayloadRead: () => void): GameSocketMessage {
  const message = { type: 'timer_tick' } as unknown as GameSocketMessage;
  Object.defineProperty(message, 'payload', {
    configurable: true,
    enumerable: true,
    get() {
      onPayloadRead();
      return { timeRemaining: 42 };
    },
  });
  return message;
}

describe('GameContext unmount safety (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('baseline: reads the socket payload while the component is mounted', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <div />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));

    let payloadRead = false;
    const message = makeProbedTimerTick(() => {
      payloadRead = true;
    });

    act(() => {
      connectOptions.onMessage!(message);
    });

    // While mounted the handler runs the switch and reads payload — this proves
    // the probe fires, so the "after unmount" assertions below are meaningful.
    expect(payloadRead).toBe(true);
  });

  it('does not read the socket payload after unmount (no setState on unmounted component)', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <div />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    const handler = connectOptions.onMessage!;

    // Unmount the provider — isMounted.current flips to false.
    unmount();

    let payloadRead = false;
    const message = makeProbedTimerTick(() => {
      payloadRead = true;
    });

    // A late socket message arrives after unmount. A guarded handler returns
    // before the switch, so payload is never touched and no setState runs.
    act(() => {
      handler(message);
    });

    expect(payloadRead).toBe(false);
  });

  it('ignores multiple late messages after unmount without touching payload', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <div />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    const handler = connectOptions.onMessage!;

    unmount();

    let reads = 0;
    act(() => {
      handler(makeProbedTimerTick(() => (reads += 1)));
      handler(makeProbedTimerTick(() => (reads += 1)));
      handler(makeProbedTimerTick(() => (reads += 1)));
    });

    expect(reads).toBe(0);
  });
});

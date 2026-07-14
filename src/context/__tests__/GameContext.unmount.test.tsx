import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';

// ---------------------------------------------------------------------------
// BUG-1 regression: the gameSocket `onMessage` callback calls setState
// (setGameState / setTimeRemaining) on the `game_state_update`, `timer_tick`
// and `host_migrated` branches with NO `isMounted.current` guard — only the
// `error` branch is guarded. If a socket frame is delivered AFTER the provider
// unmounts (the real-world race between an in-flight WS message and
// gameSocket.disconnect()), the handler performs a "setState on an unmounted
// component". The intended fix is a one-line early return at the top of the
// handler:
//
//     const handleMessage = (message: GameSocketMessage) => {
//       if (!isMounted.current) return;   // <-- the guard
//       switch (message.type) { ... }
//     };
//
// WHY WE SPY ON useState (and not on console warnings):
// React 18 silently DROPS a setState scheduled on an unmounted fiber — it emits
// no warning and does not re-render — so a console/warning assertion cannot
// distinguish the buggy build from the fixed one (it passes either way). The
// only observable that actually flips is whether the handler INVOKES the state
// setter after unmount. We therefore spy on React.useState, capture the exact
// setter instances the GameProvider created, and assert:
//   - after unmount, a socket message must NOT invoke any provider setter
//     (fails on the unguarded build, passes once the guard exists);
//   - while mounted, the same message DOES update state (the guard must not
//     regress the happy path).
// ---------------------------------------------------------------------------

// Mock the UserContext
vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// Mock the API module — getRoom returns a full authoritative room snapshot.
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

// Capture the socket callbacks so the test can drive connect/message after unmount.
type MessageHandler = (message: unknown) => void;
const connectOptions: {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
  onMessage?: MessageHandler;
} = {};
const connectMock = vi.fn((options: typeof connectOptions) => {
  connectOptions.onConnect = options.onConnect;
  connectOptions.onDisconnect = options.onDisconnect;
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

// Mock framer-motion to avoid animation issues in tests
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
      <div data-testid="current-round">{ctx.gameState.currentRound}</div>
    </div>
  );
}

// The message shapes whose handler branches call setState with no guard.
const gameStateUpdateMessage = {
  type: 'game_state_update',
  payload: {
    gameId: 'ABCD',
    roomCode: 'ABCD',
    status: 'voting',
    players: {
      'player-1': {
        name: 'TestPlayer',
        board: { tiles: [{ id: 'tile-1', genre: 'House', status: 'complete' }] },
      },
    },
    currentRound: 3,
  },
};

const timerTickMessage = {
  type: 'timer_tick',
  payload: { timeRemaining: 42 },
};

// ---------------------------------------------------------------------------
// useState spy: wrap every setter React hands out while `capturing` is true so
// we can observe post-unmount invocations. The provider's setters are created
// during its render; we tag each returned setter with a call-recording wrapper.
// ---------------------------------------------------------------------------
const realUseState = React.useState;
let capturing = false;
let setterCallsAfterArm = 0;
let armed = false;

function armSetterTracking() {
  armed = true;
  setterCallsAfterArm = 0;
}

beforeEach(() => {
  // @ts-expect-error - intentionally overriding for the spy
  React.useState = function useStateSpy<S>(initial: S) {
    const tuple = (realUseState as typeof React.useState)(initial as S);
    if (!capturing) return tuple;
    const [value, setter] = tuple as [S, React.Dispatch<React.SetStateAction<S>>];
    const wrapped: React.Dispatch<React.SetStateAction<S>> = (next) => {
      if (armed) setterCallsAfterArm += 1;
      return setter(next);
    };
    return [value, wrapped] as typeof tuple;
  };
});

afterEach(() => {
  // @ts-expect-error - restore original
  React.useState = realUseState;
});

describe('GameContext — no setState after unmount (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturing = false;
    armed = false;
    setterCallsAfterArm = 0;
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    connectOptions.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('does NOT invoke any provider state setter when a game_state_update arrives after unmount', async () => {
    capturing = true; // capture the provider's setters during its render
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );
    capturing = false;

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('playing'));

    const handler = connectOptions.onMessage!;

    // Unmount — the cleanup effect flips isMounted.current to false.
    unmount();

    // From here on, count any setter invocation. A correctly guarded handler
    // returns early and invokes NOTHING; the unguarded (buggy) handler calls
    // setGameState, which this assertion catches.
    armSetterTracking();

    expect(() =>
      act(() => {
        handler(gameStateUpdateMessage);
      }),
    ).not.toThrow();

    expect(
      setterCallsAfterArm,
      'A socket message after unmount must not trigger any setState — add ' +
        '`if (!isMounted.current) return;` at the top of the gameSocket onMessage handler.',
    ).toBe(0);
  });

  it('does NOT invoke any provider state setter when a timer_tick arrives after unmount', async () => {
    capturing = true;
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );
    capturing = false;

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('playing'));

    const handler = connectOptions.onMessage!;
    unmount();
    armSetterTracking();

    expect(() =>
      act(() => {
        handler(timerTickMessage);
      }),
    ).not.toThrow();

    expect(
      setterCallsAfterArm,
      'A timer_tick after unmount must not trigger setTimeRemaining.',
    ).toBe(0);
  });

  it('still processes messages normally while mounted (guard must not break the happy path)', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('playing'));

    const handler = connectOptions.onMessage!;

    // While mounted, a game_state_update must still be applied to state.
    act(() => {
      handler(gameStateUpdateMessage);
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('voting'));
    expect(screen.getByTestId('current-round').textContent).toBe('3');
  });
});

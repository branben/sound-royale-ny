import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider, GameStateContext, GameContext } from '../GameContext';
import { useUser } from '../UserContext';

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

// Capture the socket callbacks so the test can drive connect/disconnect/message.
type CapturedMessage = { type: string; payload: unknown };
const connectOptions: {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
  onMessage?: (message: CapturedMessage) => void;
  onError?: (error: unknown) => void;
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
      <div data-testid="player-count">{Object.keys(ctx.gameState.players).length}</div>
      <div data-testid="current-round">{ctx.gameState.currentRound}</div>
      <div data-testid="is-reconnecting">{String(ctx.isReconnecting)}</div>
    </div>
  );
}

describe('GameContext reconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    connectOptions.onMessage = undefined;
    connectOptions.onError = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('re-fetches full game state via getRoom on onConnect and REPLACES (not merges) state', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    // The initial mount fetch should call getRoom once.
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('2'));

    const callsBeforeReconnect = getRoomMock.mock.calls.length;

    // Simulate a fresh authoritative snapshot from the server with fewer
    // players and a different round — a REPLACE must drop the old players.
    const staleResponse = {
      ...mockRoomResponse,
      current_round: 7,
      players: [
        {
          id: 'player-1',
          name: 'TestPlayer',
          board: { tiles: [] },
        },
      ],
    };
    getRoomMock.mockResolvedValueOnce(staleResponse);

    // Drive the socket (re)connect callback.
    expect(connectOptions.onConnect).toBeTypeOf('function');
    await act(async () => {
      await connectOptions.onConnect!();
    });

    // getRoom was called again on reconnect.
    expect(getRoomMock.mock.calls.length).toBe(callsBeforeReconnect + 1);
    expect(getRoomMock).toHaveBeenLastCalledWith('ABCD');

    // State is REPLACED: only the 1 server player remains (no merge with prior 2).
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('1'));
    expect(screen.getByTestId('current-round').textContent).toBe('7');

    // Reconnecting flag is cleared once connected.
    expect(screen.getByTestId('is-reconnecting').textContent).toBe('false');
  });

  it('shows the ReconnectingBanner during the disconnect→reconnect window', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onDisconnect).toBeTypeOf('function'));

    // Disconnect fires — banner should become visible.
    act(() => {
      connectOptions.onDisconnect!('connection lost');
    });

    expect(screen.getByTestId('reconnecting-banner')).toBeTruthy();
    expect(screen.getByTestId('is-reconnecting').textContent).toBe('true');

    // Reconnect fires — banner should disappear.
    await act(async () => {
      await connectOptions.onConnect!();
    });

    expect(screen.queryByTestId('reconnecting-banner')).toBeNull();
    expect(screen.getByTestId('is-reconnecting').textContent).toBe('false');
  });

  it('exposes isReconnecting through the legacy useGame() context', async () => {
    function LegacyReader() {
      const ctx = React.useContext(GameContext);
      return <div data-testid="legacy-reconnecting">{String(ctx?.isReconnecting)}</div>;
    }

    render(
      <GameProvider roomCode="ABCD">
        <LegacyReader />
      </GameProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('legacy-reconnecting').textContent).toBe('false'),
    );

    act(() => {
      connectOptions.onDisconnect!('connection lost');
    });

    expect(screen.getByTestId('legacy-reconnecting').textContent).toBe('true');
  });

  it('performs a full disconnect→reconnect cycle: re-fetches, REPLACES state, toggles banner, and does not double-fetch', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    // Wait for initial mount fetch + connect callback to register.
    await waitFor(() => expect(connectOptions.onDisconnect).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('2'));
    const callsAfterMount = getRoomMock.mock.calls.length;

    // --- Disconnect: banner appears, no re-fetch yet ---
    act(() => {
      connectOptions.onDisconnect!('connection lost');
    });
    expect(screen.getByTestId('reconnecting-banner')).toBeTruthy();
    expect(screen.getByTestId('is-reconnecting').textContent).toBe('true');
    // Disconnect alone must NOT trigger a re-fetch (only the reconnect does).
    expect(getRoomMock.mock.calls.length).toBe(callsAfterMount);

    // Server advances state while the client was offline: a brand-new snapshot
    // with a different round and a different tile set. A reconnect must REPLACE
    // the local board with this authoritative snapshot (no stale tiles/score).
    const recoveredResponse = {
      ...mockRoomResponse,
      current_round: 9,
      status: 'voting' as const,
      players: [
        {
          id: 'player-1',
          name: 'TestPlayer',
          board: {
            tiles: [
              { id: 'tile-1', genre: 'House', status: 'complete' as const },
              { id: 'tile-new', genre: 'Jazz', status: 'pending' as const },
            ],
          },
        },
      ],
    };
    getRoomMock.mockResolvedValueOnce(recoveredResponse);

    // --- Reconnect: drives the onConnect handler which re-fetches full state ---
    await act(async () => {
      await connectOptions.onConnect!();
    });

    // Exactly ONE re-fetch on reconnect (no duplicate updates / flicker).
    expect(getRoomMock.mock.calls.length).toBe(callsAfterMount + 1);
    expect(getRoomMock).toHaveBeenLastCalledWith('ABCD');

    // Banner cleared, and the board reflects the RECOVERED server state.
    await waitFor(() => expect(screen.queryByTestId('reconnecting-banner')).toBeNull());
    expect(screen.getByTestId('is-reconnecting').textContent).toBe('false');
    expect(screen.getByTestId('player-count').textContent).toBe('1');
    expect(screen.getByTestId('current-round').textContent).toBe('9');
    expect(screen.getByTestId('status').textContent).toBe('voting');
  });
});

// ---------------------------------------------------------------------------
// BUG-1 regression: socket message handler must not setState after unmount.
//
// The socket message handler (game_state_update / timer_tick / host_migrated)
// calls setGameState / setTimeRemaining WITHOUT an `if (!isMounted.current)`
// guard. If a queued/in-flight WS message is delivered AFTER the provider has
// unmounted, the handler performs a state update on an unmounted component.
//
// Note on detection: React 18 dropped the old "Can't perform a React state
// update on an unmounted component" console warning, so a console.error spy is
// NOT a reliable signal. Instead we spy on the actual state dispatch: we wrap
// React.useState during render so every state setter the provider creates is
// recorded, then after unmount we clear the recorder and fire a socket message.
// If the handler is guarded, NO setter runs after unmount; if it is unguarded,
// setGameState / setTimeRemaining fire, which the recorder catches.
//
// This suite FAILS against the current (unguarded) handler and PASSES once an
// `if (!isMounted.current) return;` early return is added at the top of the
// socket message handler in GameContext.tsx.
// ---------------------------------------------------------------------------
describe('GameContext socket message handler after unmount (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    connectOptions.onMessage = undefined;
    connectOptions.onError = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  // Wrap React.useState so every setter produced during a render is tracked.
  // `dispatchCalls` records each post-arm setter invocation with the value the
  // caller passed, so the assertion can prove a state update was attempted.
  function armUseStateSpy() {
    const dispatchCalls: unknown[] = [];
    let armed = false;
    const realUseState = React.useState;
    const spy = vi
      .spyOn(React, 'useState')
      .mockImplementation(((initial: unknown) => {
        const [value, setter] = (realUseState as typeof React.useState)(
          initial as never,
        );
        const wrapped = ((next: unknown) => {
          if (armed) dispatchCalls.push(next);
          return (setter as (v: unknown) => void)(next);
        }) as typeof setter;
        return [value, wrapped] as ReturnType<typeof React.useState>;
      }) as typeof React.useState);
    return {
      dispatchCalls,
      arm: () => {
        armed = true;
      },
      restore: () => spy.mockRestore(),
    };
  }

  it('does not dispatch any state update when a game_state_update arrives after unmount', async () => {
    const stateSpy = armUseStateSpy();

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    // Wait for the socket to connect and register its message handler.
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('2'));

    const handleMessage = connectOptions.onMessage!;

    // Provider unmounts (e.g. user navigates away) — isMounted.current becomes false.
    unmount();

    // Only count dispatches that happen from here on (after unmount).
    stateSpy.arm();

    // A late/in-flight WS message is delivered AFTER unmount. With the guard,
    // this is a no-op; without it, setGameState fires on an unmounted component.
    act(() => {
      handleMessage({
        type: 'game_state_update',
        payload: {
          gameId: 'ABCD',
          roomCode: 'ABCD',
          status: 'playing',
          currentRound: 3,
          players: {
            'player-1': { name: 'TestPlayer', board: { tiles: [] } },
          },
        },
      });
    });

    const dispatched = [...stateSpy.dispatchCalls];
    stateSpy.restore();

    expect(
      dispatched,
      'A game_state_update delivered after unmount dispatched a state update on an unmounted component. ' +
        'Add `if (!isMounted.current) return;` at the top of the socket message handler.',
    ).toHaveLength(0);
  });

  it('does not dispatch any state update when a timer_tick arrives after unmount', async () => {
    const stateSpy = armUseStateSpy();

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('2'));

    const handleMessage = connectOptions.onMessage!;

    unmount();
    stateSpy.arm();

    // A timer_tick after unmount would call setTimeRemaining on an unmounted component.
    act(() => {
      handleMessage({
        type: 'timer_tick',
        payload: { timeRemaining: 42 },
      });
    });

    const dispatched = [...stateSpy.dispatchCalls];
    stateSpy.restore();

    expect(
      dispatched,
      'A timer_tick delivered after unmount dispatched a state update on an unmounted component. ' +
        'Add `if (!isMounted.current) return;` at the top of the socket message handler.',
    ).toHaveLength(0);
  });
});

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
const connectOptions: {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
  onMessage?: (message: unknown) => void;
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

/**
 * Regression test for BUG-1 (bug_risk): the socket message handler in
 * GameContext (`handleMessage`) calls state setters — `setGameState`
 * (game_state_update, host_migrated) and `setTimeRemaining` (timer_tick) —
 * WITHOUT an `isMounted.current` guard. If a socket message is delivered after
 * the provider has unmounted, those setters run against an unmounted component
 * (a leaked "setState after unmount"). React 18 no longer emits the old
 * dev warning for this, so we cannot rely on console output; instead we spy on
 * the state setters directly and assert that NONE of them are invoked once the
 * component has unmounted.
 *
 * These tests FAIL under the current (unguarded) code — the setter fires after
 * unmount — and PASS once every setState inside `handleMessage` is guarded with
 * `if (!isMounted.current) return;`.
 */
describe('GameContext — no setState after unmount (BUG-1)', () => {
  // All state setters captured from the provider's useState calls, in the
  // order GameContext declares them:
  //   [gameState, isLoading, error, timeRemaining, isReconnecting]
  let capturedSetters: Array<ReturnType<typeof vi.fn>>;
  let useStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    connectOptions.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());

    capturedSetters = [];

    const realUseState = React.useState.bind(React);
    // Wrap useState so every setter is replaced with a spy that records calls.
    // The spy still forwards to the real setter, so component behaviour is
    // unchanged — we only observe whether a setter is called after unmount.
    useStateSpy = vi
      .spyOn(React, 'useState')
      .mockImplementation(((initial: unknown) => {
        const [value, realSet] = realUseState(initial as never) as [
          unknown,
          (v: unknown) => void,
        ];
        const spySetter = vi.fn((v: unknown) => realSet(v));
        capturedSetters.push(spySetter);
        return [value, spySetter] as [unknown, (v: unknown) => void];
      }) as typeof React.useState);
  });

  afterEach(() => {
    useStateSpy.mockRestore();
  });

  // Number of setter calls recorded across every captured setter.
  function totalSetterCalls() {
    return capturedSetters.reduce((sum, s) => sum + s.mock.calls.length, 0);
  }

  async function mountProvider() {
    const result = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('2'));
    return result;
  }

  it('does not call any state setter when a timer_tick arrives after unmount', async () => {
    const { unmount } = await mountProvider();
    const deliver = connectOptions.onMessage!;

    // Unmount BEFORE the late message; the socket callback is still held.
    unmount();
    const callsAtUnmount = totalSetterCalls();

    // A late timer_tick arrives after unmount. With the guard this is a no-op;
    // without it, setTimeRemaining fires against an unmounted component.
    act(() => {
      deliver({ type: 'timer_tick', payload: { timeRemaining: 12 } });
    });

    expect(totalSetterCalls()).toBe(callsAtUnmount);
  });

  it('does not call any state setter when a game_state_update arrives after unmount', async () => {
    const { unmount } = await mountProvider();
    const deliver = connectOptions.onMessage!;

    unmount();
    const callsAtUnmount = totalSetterCalls();

    act(() => {
      deliver({
        type: 'game_state_update',
        payload: {
          gameId: 'ABCD',
          roomCode: 'ABCD',
          status: 'playing',
          players: {
            'player-1': { id: 'player-1', name: 'TestPlayer', board: { tiles: [] } },
          },
          currentRound: 3,
        },
      });
    });

    expect(totalSetterCalls()).toBe(callsAtUnmount);
  });

  it('does not call any state setter when a host_migrated message arrives after unmount', async () => {
    const { unmount } = await mountProvider();
    const deliver = connectOptions.onMessage!;

    unmount();
    const callsAtUnmount = totalSetterCalls();

    act(() => {
      deliver({
        type: 'host_migrated',
        payload: { newHostId: 'player-2', newHostName: 'OtherPlayer' },
      });
    });

    expect(totalSetterCalls()).toBe(callsAtUnmount);
  });

  it('DOES call a state setter for the same message while still mounted (guards the test itself)', async () => {
    // Sanity check: while mounted, delivering a timer_tick MUST call a setter.
    // This proves the after-unmount assertions above are meaningful and not
    // trivially green because the message is inert.
    await mountProvider();
    const deliver = connectOptions.onMessage!;

    const before = totalSetterCalls();
    act(() => {
      deliver({ type: 'timer_tick', payload: { timeRemaining: 7 } });
    });
    expect(totalSetterCalls()).toBeGreaterThan(before);
  });
});

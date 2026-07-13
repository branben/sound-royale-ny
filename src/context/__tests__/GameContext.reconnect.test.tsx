import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider, GameStateContext, GameContext } from '../GameContext';
import { useUser } from '../UserContext';
// Imported from the MOCKED @/services/api above — used as a deterministic probe
// for whether the post-await state-update path runs (see BUG-1 block below).
import { normalizeRoomWinner } from '@/services/api';

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

// Capture the socket callbacks so the test can drive connect/disconnect.
const connectOptions: {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
  onMessage?: (m: { type: string; payload: unknown }) => void;
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


// ---------------------------------------------------------------------------
// BUG-1 regression: the socket onMessage handler must not process a message
// (and thus setState) after the component has unmounted.
//
// GameProvider registers gameSocket.connect({ onMessage: handleMessage, ... }).
// handleMessage() reacts to server pushes — 'game_state_update' calls
// setGameState(...), 'timer_tick' calls setTimeRemaining(...), 'host_migrated'
// calls setGameState(...). None of those are guarded by isMounted, so a socket
// frame that arrives AFTER the provider unmounts triggers a state update on an
// unmounted component (stale write + wasted work). (The 'error' branch and the
// onConnect reconnect refetch are already isMounted-guarded — this gap is the
// onMessage handler.)
//
// The fix is an early `if (!isMounted.current) return;` guard at the top of
// handleMessage (or around each setState in it).
//
// DETECTION (warning-independent): React 18 removed the old "state update on an
// unmounted component" console warning (verified empirically — it emits
// nothing), so we cannot assert on console output. Instead we drive a message
// whose payload is read THROUGH A SPY: handleMessage's 'game_state_update'
// branch reads `message.payload.players` while building the next state. We fire
// that message AFTER unmount using a payload whose `players` is a getter we
// observe:
//   • guard MISSING → handler runs post-unmount → reads payload.players → spy
//     fires → test FAILS.
//   • guard PRESENT → handler returns early → payload.players never read → spy
//     does not fire → test PASSES.
//
// A pre-unmount control message proves the spy DOES fire on the happy path, so
// the post-unmount assertion is meaningful (not vacuously true).
// ---------------------------------------------------------------------------
describe('GameContext reconnect — unmount safety (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    connectOptions.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  // Build a 'game_state_update' message whose `payload.players` is read through
  // a spy, so we can tell whether handleMessage actually processed it.
  function makeGameStateUpdate(playersReadSpy: () => void) {
    const players = {
      'player-1': { name: 'TestPlayer', board: { tiles: [] } },
    };
    const payload = {
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'playing',
      currentRound: 3,
    } as Record<string, unknown>;
    // `players` is read via a getter so we can detect handler execution.
    Object.defineProperty(payload, 'players', {
      enumerable: true,
      get() {
        playersReadSpy();
        return players;
      },
    });
    return { type: 'game_state_update', payload };
  }

  it('does not process a socket game_state_update (no setState) after unmount', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    // Let the initial mount fetch settle and the socket onMessage register.
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('2'));

    // --- Control: while STILL MOUNTED, a game_state_update IS processed. ---
    const mountedRead = vi.fn();
    act(() => {
      connectOptions.onMessage!(makeGameStateUpdate(mountedRead));
    });
    // Proves the spy fires on the happy path — the post-unmount check below is
    // therefore a real signal, not vacuously green.
    expect(mountedRead).toHaveBeenCalled();
    // And the update was actually applied to state (1 player from the message).
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('1'));

    // --- Unmount the provider (isMounted.current -> false). ---
    unmount();

    // --- A socket frame arrives AFTER unmount. It must be ignored. ---
    const afterUnmountRead = vi.fn();
    act(() => {
      connectOptions.onMessage!(makeGameStateUpdate(afterUnmountRead));
    });

    // With the isMounted guard, handleMessage returns before touching the
    // payload, so the getter is never read and no setState is attempted.
    // Without the guard, the handler runs and reads payload.players post-unmount.
    expect(afterUnmountRead).not.toHaveBeenCalled();
  });

  it('does not process a socket timer_tick (no setTimeRemaining) after unmount', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('player-count').textContent).toBe('2'));

    unmount();

    // timer_tick reads message.payload.timeRemaining and calls setTimeRemaining.
    // Fire it post-unmount through a getter spy; the guard must stop the read.
    const timeRead = vi.fn();
    const payload = {} as Record<string, unknown>;
    Object.defineProperty(payload, 'timeRemaining', {
      enumerable: true,
      get() {
        timeRead();
        return 30;
      },
    });

    act(() => {
      connectOptions.onMessage!({ type: 'timer_tick', payload });
    });

    expect(timeRead).not.toHaveBeenCalled();
  });
});

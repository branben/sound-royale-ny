import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';

// ---------------------------------------------------------------------------
// BUG-1 regression: setState-on-an-unmounted-component
//
// GameContext kicks off async work on mount (roomApi.getRoom(...)) and again on
// every socket (re)connect (refreshRoomState -> getRoom). If the component
// unmounts while one of those promises is still in flight, resolving it must
// NOT drive a state update on the dead tree. The fix is the `isMounted` ref
// guard around every post-await setState.
//
// These tests reproduce the race deterministically: they hold getRoom pending,
// unmount the provider, and only THEN settle the promise. They then assert the
// guard held — nothing re-rendered the unmounted subtree, nothing threw, and no
// React "unmounted component" / not-wrapped-in-act warning was emitted.
//
// Note on React 18: React 18 silently drops setState on an unmounted component
// (the old dev warning was removed). So the render-count assertion below is the
// primary behavioral check — it fails the moment a post-unmount update slips
// through and re-renders the subtree — while the console.error assertion keeps
// the guard honest under StrictMode double-invocation and any React version
// (past or future) that DOES surface such an update as a warning.
// ---------------------------------------------------------------------------

vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// A controllable promise so the test decides exactly WHEN getRoom settles —
// specifically, after the provider has unmounted.
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

// Hoisted so the (hoisted) vi.mock factory can close over them AND the tests can
// assert on them. normalizeRoomWinnerMock is the load-bearing seam: it's called
// by buildGameStateFromRoom(), which in the async paths runs *inside* the
// `if (isMounted.current)` guard. So "was normalizeRoomWinner called after
// unmount?" is a deterministic, React-version-independent proxy for "did the
// guarded post-await setGameState run on the dead tree?" — unlike the
// render-count check, which React 18 makes vacuous by silently dropping the
// setState (see the header note).
const { getRoomMock, normalizeRoomWinnerMock } = vi.hoisted(() => ({
  getRoomMock: vi.fn(),
  normalizeRoomWinnerMock: vi.fn((w: unknown) => {
    if (!w) return undefined;
    if (typeof w === 'string') return w;
    if (typeof w === 'object' && w !== null && 'id' in w) return (w as { id: string }).id;
    return undefined;
  }),
}));

vi.mock('@/services/api', () => ({
  roomApi: {
    getRoom: (...args: unknown[]) => getRoomMock(...(args as [string])),
  },
  gameApi: {},
  getStoredAccessToken: vi.fn(() => null),
  normalizeRoomWinner: (winner: unknown) => normalizeRoomWinnerMock(winner),
}));

// Capture the socket callbacks so the test can drive (re)connect AND inbound
// messages — the two places GameContext does a setState from a socket callback.
// onMessage (handleMessage) is the SYNCHRONOUS callback the review flagged:
// a `game_state_update` / `timer_tick` arriving after unmount would setState on
// the dead tree unless guarded.
const connectOptions: {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
  onMessage?: (message: { type: string; payload?: unknown }) => void;
  onError?: (error: unknown) => void;
} = {};
const connectMock = vi.fn((options: typeof connectOptions) => {
  connectOptions.onConnect = options.onConnect;
  connectOptions.onDisconnect = options.onDisconnect;
  connectOptions.onMessage = options.onMessage;
  connectOptions.onError = options.onError;
});

vi.mock('@/services/gameSocket', () => {
  const socket = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof connectOptions) => void)(...(args as [typeof connectOptions])),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return { __esModule: true, default: socket, gameSocket: socket };
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

// A consumer that re-renders whenever GameContext state changes. We count its
// renders so we can prove no state update re-rendered the subtree AFTER unmount.
let renderCount = 0;
function StateReader() {
  const ctx = React.useContext(GameStateContext);
  renderCount += 1;
  if (!ctx) return null;
  return <div data-testid="player-count">{Object.keys(ctx.gameState.players).length}</div>;
}

// Matches React's unmounted-update / not-wrapped-in-act warnings across
// versions and phrasings.
const POST_UNMOUNT_WARNING_RE =
  /unmounted component|state update on an?\s.*unmounted|not wrapped in act/i;

describe('GameContext — no setState after unmount (BUG-1 regression)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    connectOptions.onMessage = undefined;
    connectOptions.onError = undefined;
    renderCount = 0;
    mockUseUser.mockReturnValue(createDefaultUserSession());
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function assertNoPostUnmountWarning() {
    const calls = consoleErrorSpy.mock.calls as unknown[][];
    const offending = calls.filter((args) =>
      args.some((a) => typeof a === 'string' && POST_UNMOUNT_WARNING_RE.test(a)),
    );
    expect(
      offending,
      `Expected no React post-unmount state-update warning, got:\n` +
        offending.map((a) => JSON.stringify(a)).join('\n'),
    ).toHaveLength(0);
  }

  // Load-bearing check for the async paths: buildGameStateFromRoom() -> which
  // calls normalizeRoomWinner() -> sits INSIDE `if (isMounted.current)` before
  // the post-await setGameState. So if the guard held, normalizeRoomWinner must
  // NOT have been invoked by the post-unmount settle. This detects a BUG-1
  // regression even on React 18, where the render-count assertion is vacuous
  // (React silently drops setState on an unmounted component). Verified by
  // neutralizing the guard: this goes from 0 -> 1 call and the test fails.
  function assertGuardedFetchDidNotApply(callsBeforeSettle: number) {
    expect(
      normalizeRoomWinnerMock.mock.calls.length,
      'buildGameStateFromRoom/normalizeRoomWinner ran after unmount — the ' +
        'isMounted guard around the post-await setGameState leaked (BUG-1).',
    ).toBe(callsBeforeSettle);
  }

  it('does not re-render / setState when the mount getRoom() resolves AFTER unmount', async () => {
    // getRoom stays pending until we resolve it by hand.
    const deferred = defer<typeof mockRoomResponse>();
    getRoomMock.mockReturnValue(deferred.promise);

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    // The mount effect fired the fetch, but it's still in flight.
    await waitFor(() => expect(getRoomMock).toHaveBeenCalledWith('ABCD'));

    // Unmount BEFORE the fetch resolves — this trips the guard.
    unmount();
    const rendersAtUnmount = renderCount;
    const normalizeCallsAtUnmount = normalizeRoomWinnerMock.mock.calls.length;

    // Now the in-flight request resolves against a dead component tree. If the
    // guard were removed, the guarded setGameState (via buildGameStateFromRoom
    // -> normalizeRoomWinner) would run here.
    await act(async () => {
      deferred.resolve(mockRoomResponse);
      await deferred.promise;
    });

    // Primary (load-bearing on React 18): the guarded work did not run.
    assertGuardedFetchDidNotApply(normalizeCallsAtUnmount);
    // Secondary: no extra render, no React warning.
    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });

  it('does not re-render / setState when a REJECTED mount getRoom() settles AFTER unmount', async () => {
    // Exercises the catch/finally branches (guarded setError + setIsLoading).
    const deferred = defer<typeof mockRoomResponse>();
    getRoomMock.mockReturnValue(deferred.promise);

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(getRoomMock).toHaveBeenCalledWith('ABCD'));

    unmount();
    const rendersAtUnmount = renderCount;

    await act(async () => {
      deferred.reject(new Error('network down'));
      await deferred.promise.catch(() => {});
    });

    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });

  it('does not re-render / setState when the reconnect refresh resolves AFTER unmount', async () => {
    // Let the initial mount fetch complete so the socket effect registers.
    getRoomMock.mockResolvedValue(mockRoomResponse);

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onConnect).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    // Arm a controllable promise for the reconnect refresh, kick off onConnect
    // (which awaits refreshRoomState -> getRoom), then unmount mid-flight.
    const deferred = defer<typeof mockRoomResponse>();
    getRoomMock.mockReturnValue(deferred.promise);

    let onConnectDone: Promise<void> | void;
    act(() => {
      onConnectDone = connectOptions.onConnect!();
    });

    unmount();
    const rendersAtUnmount = renderCount;
    const normalizeCallsAtUnmount = normalizeRoomWinnerMock.mock.calls.length;

    await act(async () => {
      deferred.resolve(mockRoomResponse);
      await Promise.resolve(onConnectDone);
    });

    // refreshRoomState's guarded setGameState (buildGameStateFromRoom ->
    // normalizeRoomWinner) must not have applied against the dead tree.
    assertGuardedFetchDidNotApply(normalizeCallsAtUnmount);
    // onConnect's post-await setIsReconnecting / setConnectionError / setGameState
    // are all guarded — none should have re-rendered the unmounted tree.
    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });

  it('survives the same race under StrictMode (double-invoked effects)', async () => {
    // StrictMode double-invokes effects in dev, which is the classic place a
    // missing/reset mount guard leaks a post-unmount update. The race must
    // still be clean.
    const deferred = defer<typeof mockRoomResponse>();
    getRoomMock.mockReturnValue(deferred.promise);

    const { unmount } = render(
      <React.StrictMode>
        <GameProvider roomCode="ABCD">
          <StateReader />
        </GameProvider>
      </React.StrictMode>,
    );

    await waitFor(() => expect(getRoomMock).toHaveBeenCalledWith('ABCD'));

    unmount();
    const rendersAtUnmount = renderCount;

    await act(async () => {
      deferred.resolve(mockRoomResponse);
      await deferred.promise;
    });

    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });

  // -------------------------------------------------------------------------
  // Socket onMessage path (the SYNCHRONOUS callback the review flagged).
  //
  // handleMessage runs synchronously when the socket delivers a frame. The
  // socket lives outside React's lifecycle, so a frame can arrive AFTER the
  // provider unmounts (a late `game_state_update` / `timer_tick` / `host_migrated`
  // flushed during teardown). Those branches call setState WITHOUT an isMounted
  // guard (setGameState at GameContext L309/L342, setTimeRemaining at L329).
  //
  // HONEST SCOPE OF THESE THREE TESTS: unlike the async tests above, there is no
  // external seam (no buildGameStateFromRoom/normalizeRoomWinner) to observe in
  // these branches — they build state inline. And on React 18.3.1 the setState
  // is silently dropped, so the render-count / warning checks CANNOT distinguish
  // guarded from unguarded here (removing the guard does not make them fail).
  // These are therefore ROBUSTNESS / smoke tests: they document the flagged
  // path and assert the app tolerates a late frame without throwing. They are
  // NOT load-bearing BUG-1 regression guards on React 18 — the async tests above
  // are. If the app moves to a React that surfaces the update (or the branches
  // gain an early `if (!isMounted.current) return;` with observable work before
  // it), tighten these to a load-bearing assertion like the async ones.
  // -------------------------------------------------------------------------

  it('does not re-render / setState when a game_state_update frame arrives AFTER unmount', async () => {
    getRoomMock.mockResolvedValue(mockRoomResponse);

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    // Socket effect registered its onMessage handler.
    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    // Let the mount fetch settle so later renders come only from the frame.
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    const onMessage = connectOptions.onMessage!;

    unmount();
    const rendersAtUnmount = renderCount;

    // A late frame is delivered to the (now unmounted) provider. handleMessage's
    // `game_state_update` branch does setGameState((prev) => ...); without an
    // isMounted guard that re-renders the dead subtree.
    act(() => {
      onMessage({
        type: 'game_state_update',
        payload: {
          gameId: 'ABCD',
          roomCode: 'ABCD',
          status: 'playing',
          players: {
            'player-9': {
              name: 'Late',
              board: { tiles: [] },
            },
          },
          currentRound: 3,
        },
      });
    });

    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });

  it('does not re-render / setState when a timer_tick frame arrives AFTER unmount', async () => {
    getRoomMock.mockResolvedValue(mockRoomResponse);

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    const onMessage = connectOptions.onMessage!;

    unmount();
    const rendersAtUnmount = renderCount;

    // `timer_tick` -> setTimeRemaining(...) is another unguarded setState in the
    // same socket callback.
    act(() => {
      onMessage({ type: 'timer_tick', payload: { timeRemaining: 42 } });
    });

    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });

  it('does not re-render / setState when a host_migrated frame arrives AFTER unmount', async () => {
    getRoomMock.mockResolvedValue(mockRoomResponse);

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    const onMessage = connectOptions.onMessage!;

    unmount();
    const rendersAtUnmount = renderCount;

    // `host_migrated` -> setGameState((prev) => ...) — a third unguarded path.
    act(() => {
      onMessage({ type: 'host_migrated', payload: { newHostId: 'player-1' } });
    });

    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });
});

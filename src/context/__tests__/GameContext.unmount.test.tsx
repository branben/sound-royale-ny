import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';

// ---------------------------------------------------------------------------
// BUG-1 regression: setState-on-an-unmounted-component
//
// GameContext drives state updates from two kinds of callbacks that outlive a
// render:
//   1. ASYNC work — roomApi.getRoom(...) on mount, and again on every socket
//      (re)connect (refreshRoomState -> getRoom). A promise can settle after the
//      provider unmounts.
//   2. The SYNCHRONOUS socket callback handleMessage(onMessage) — the socket
//      lives outside React's lifecycle, so a `game_state_update` / `timer_tick` /
//      `host_migrated` frame can be delivered AFTER unmount.
// In both cases, resolving/handling must NOT drive a setState on the dead tree.
// The async paths already guard every post-await setState with the `isMounted`
// ref; the fix the BUG-1 review asks for on the sync path is an early
// `if (!isMounted.current) return;` at the top of handleMessage.
//
// These tests reproduce each race deterministically: they arrange the callback
// to fire only AFTER unmount, then assert the guard held.
//
// WHY THE ASSERTIONS ARE LOAD-BEARING ON REACT 18 (not vacuous):
// React 18.3.1 silently DROPS the re-render for a setState on an unmounted
// component (the old dev warning was removed), so render-count / console.error
// checks alone cannot tell a guarded path from an unguarded one. So each
// load-bearing test instead observes whether the *setState updater actually
// ran*, which React 18 still executes even when it discards the render:
//   - Async paths: buildGameStateFromRoom() -> normalizeRoomWinner() runs INSIDE
//     the `if (isMounted.current)` block, so a spy on normalizeRoomWinner proves
//     the guarded setGameState did/didn't fire after unmount.
//   - Sync onMessage `game_state_update`: setGameState((prev) => ({ gameId:
//     newState.gameId || roomCode, ... })) reads `payload.gameId` INSIDE the
//     functional update, so a getter on payload.gameId proves whether the
//     (unguarded) updater executed on the dead tree.
// Both are mutation-verified: neutralizing the guard flips the assertion (the
// test fails), restoring it makes it pass. render-count / warning checks are
// kept as secondary signals for StrictMode and non-React-18 versions.
//
// NOTE on the current app state: handleMessage does NOT yet have the
// `if (!isMounted.current) return;` guard, so the load-bearing
// `game_state_update` test FAILS against GameContext.tsx as shipped — that
// failure IS the regression signal for BUG-1. Adding the one-line guard (an
// app-code change, outside the test agent's remit) turns it green. The two
// remaining onMessage branches (`timer_tick` — a direct-value setState with no
// updater body; `host_migrated` — a functional update that only reads React's
// own `prev`, with no test-injectable seam) cannot be made load-bearing on
// React 18 without an app-code seam, so they are kept as documented robustness /
// smoke tests over the same callback.
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
  // Socket onMessage path (the SYNCHRONOUS callback the review flagged in BUG-1:
  // "Socket callback calls setState without an isMounted guard").
  //
  // handleMessage runs synchronously when the socket delivers a frame. The
  // socket lives outside React's lifecycle, so a frame can arrive AFTER the
  // provider unmounts (a late `game_state_update` / `timer_tick` / `host_migrated`
  // flushed during teardown). Those branches call setState WITHOUT an isMounted
  // guard (setGameState at GameContext L309/L342, setTimeRemaining at L329). The
  // fix the review asks for is an early `if (!isMounted.current) return;` in
  // handleMessage.
  //
  // MAKING THESE LOAD-BEARING ON REACT 18 (the seam the earlier revision said
  // didn't exist): React 18 silently DROPS the re-render for a setState on an
  // unmounted component, so render-count / warning checks are vacuous here (they
  // stay green whether or not the guard exists — mutation-verified). BUT React
  // still *invokes the setState updater function itself* — it only discards the
  // resulting render. So for the two branches that use a functional update
  // `setGameState((prev) => ...)`, "did the updater run after unmount?" is an
  // observable, React-18-proof proxy for "was the unguarded setGameState called?"
  //   - guard present  -> handleMessage returns early -> setGameState never
  //     called -> updater never runs -> our seam is untouched.
  //   - guard absent    -> setGameState is called -> React runs the updater on
  //     the dead tree -> our seam fires.
  //
  // The `game_state_update` updater reads `newState.gameId` (GameContext L311)
  // INSIDE the functional update, so a getter on `payload.gameId` is a precise
  // "did the updater run?" probe. (Note `newState.players` is iterated *before*
  // setState, so only a property read that lives inside the (prev) => ({...})
  // body — like gameId — is a valid seam.)
  // -------------------------------------------------------------------------

  // Load-bearing seam for the functional-update onMessage branches: returns a
  // payload whose `gameId` getter is a spy. `gameId` is read INSIDE
  // setGameState((prev) => ({ gameId: newState.gameId || roomCode, ... })), so
  // the spy fires iff the (unguarded) setGameState updater executed.
  function gameStateUpdatePayloadWithProbe() {
    const gameIdProbe = vi.fn(() => 'ABCD');
    const payload: Record<string, unknown> = {
      roomCode: 'ABCD',
      status: 'playing',
      players: { 'player-9': { name: 'Late', board: { tiles: [] } } },
      currentRound: 3,
    };
    Object.defineProperty(payload, 'gameId', { get: gameIdProbe, enumerable: true });
    return { payload, gameIdProbe };
  }

  it('does not setState when a game_state_update frame arrives AFTER unmount (load-bearing)', async () => {
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
    const { payload, gameIdProbe } = gameStateUpdatePayloadWithProbe();

    // A late frame is delivered to the (now unmounted) provider. handleMessage's
    // `game_state_update` branch does setGameState((prev) => ({ gameId:
    // newState.gameId || roomCode, ... })) — with an isMounted guard that
    // setGameState is never reached and the updater never reads gameId.
    act(() => {
      onMessage({ type: 'game_state_update', payload });
    });

    // LOAD-BEARING: the guarded early-return means setGameState is never called,
    // so React never runs the updater and never reads payload.gameId. If the
    // guard is missing (current BUG-1 state) React invokes the updater on the
    // dead tree and this fires (0 -> 1). Mutation-checked both directions.
    expect(
      gameIdProbe.mock.calls.length,
      'game_state_update ran setGameState on an unmounted GameProvider — add ' +
        '`if (!isMounted.current) return;` at the top of handleMessage (BUG-1).',
    ).toBe(0);
    // Secondary (vacuous on React 18, kept for other React versions): no extra
    // render, no post-unmount warning.
    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });

  it('does not setState when a timer_tick frame arrives AFTER unmount (robustness)', async () => {
    // HONEST SCOPE: `timer_tick` -> setTimeRemaining(message.payload.timeRemaining)
    // is a DIRECT-VALUE setState (no functional updater), so there is no updater
    // body to observe — and React 18 silently drops the update. This one cannot
    // be made load-bearing without an app-code seam, so it stays a robustness /
    // smoke test: it documents the flagged branch and proves a late timer frame
    // does not throw or re-render the dead tree. The game_state_update test above
    // is the load-bearing guard for the onMessage path.
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

    act(() => {
      onMessage({ type: 'timer_tick', payload: { timeRemaining: 42 } });
    });

    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });

  it('does not setState when a host_migrated frame arrives AFTER unmount (robustness)', async () => {
    // HONEST SCOPE: `host_migrated` -> setGameState((prev) => ...) DOES use a
    // functional updater, but the updater only reads `prev.players` (React's own
    // state) — not the payload — and game_state_update rebuilds players into a
    // fresh object, so there is no test-injectable seam inside prev to observe
    // (verified: a proxy seeded via a prior frame never reaches React state).
    // `newHostId` is destructured BEFORE setState, so a payload getter fires
    // regardless of the guard and is NOT a valid seam. This stays a robustness /
    // smoke test covering the same handleMessage callback; the load-bearing
    // guard for the onMessage path is the game_state_update test above.
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

    act(() => {
      onMessage({ type: 'host_migrated', payload: { newHostId: 'player-1' } });
    });

    expect(renderCount).toBe(rendersAtUnmount);
    assertNoPostUnmountWarning();
  });
});


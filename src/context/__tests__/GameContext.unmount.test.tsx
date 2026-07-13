import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';

// ---------------------------------------------------------------------------
// BUG-1 regression: setState-on-an-unmounted-component
//
// GameContext kicks off async work on mount (roomApi.getRoom(...)), on every
// socket (re)connect (refreshRoomState -> getRoom), and on every inbound socket
// frame (the SYNCHRONOUS onMessage/handleMessage callback the review flagged).
// If the component unmounts while a promise is in flight OR a late frame is
// delivered, that work must NOT drive a state update on the dead tree.
//
// This file has TWO kinds of tests:
//
//   1. ASYNC paths (mount getRoom, reconnect refresh) — GUARDED in app code by
//      the `isMounted` ref around the post-await setState. These are
//      load-bearing via the normalizeRoomWinner seam (see below) and PASS
//      against the real code; mutation-verified (neutralize the guard -> fail).
//
//   2. SYNC onMessage path (game_state_update / timer_tick / host_migrated) —
//      currently UNGUARDED in app code (BUG-1, exactly what the review flagged).
//      These are written with `it.fails()` because they REPRODUCE the bug: they
//      prove handleMessage still reads/applies a late frame after unmount. They
//      turn green — and `it.fails` then ERRORS — the moment a maintainer adds
//      `if (!isMounted.current) return;` to handleMessage. See the detailed
//      block above those three tests for the load-bearing payload-getter seam.
//
// Note on React 18: React 18 silently drops setState on an unmounted component
// (the old dev warning was removed), so render-count / console.error checks are
// vacuous on their own. The real guards use observable seams: normalizeRoomWinner
// for the async paths, and payload-getter spies for the onMessage path.
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
  // Socket onMessage path (the SYNCHRONOUS callback the review flagged — BUG-1).
  //
  // handleMessage runs synchronously when the socket delivers a frame. The
  // socket lives outside React's lifecycle, so a frame can arrive AFTER the
  // provider unmounts (a late `game_state_update` / `timer_tick` / `host_migrated`
  // flushed during teardown). Those branches call setState WITHOUT an isMounted
  // guard (setGameState at GameContext L309/L342, setTimeRemaining at L329) —
  // this IS the setState-on-unmounted-component the reviewer flagged.
  //
  // WHY render-count / warning checks are NOT enough here: unlike the async
  // paths there is no buildGameStateFromRoom/normalizeRoomWinner seam, and on
  // React 18.3.1 setState-after-unmount is silently dropped (no re-render, no
  // dev warning). So those assertions stay green whether the guard exists or
  // not — they cannot detect the regression.
  //
  // THE LOAD-BEARING SEAM: React 18 still invokes the reducer / reads the
  // dispatch argument the FIRST time setState is called after unmount (it only
  // bails on the next dispatch). And more usefully, handleMessage READS the
  // frame payload (message.payload.players / .timeRemaining / .newHostId) as
  // part of doing its work. The reviewer's requested fix is an early
  // `if (!isMounted.current) return;` at the TOP of handleMessage — which
  // returns BEFORE any payload read. So we hand handleMessage a payload whose
  // fields are GETTER SPIES and assert the getters are NOT touched after
  // unmount. Guarded (early return) -> payload never read -> 0 getter calls.
  // Unguarded (current code) -> payload read -> getter fires. This distinguishes
  // guarded from unguarded on React 18, verified by mutation both directions
  // (add the guard -> getter calls 1->0).
  //
  // STATUS: these three are written with `it.fails()` because BUG-1 is NOT yet
  // fixed in GameContext.tsx (the guard is app code, outside the test agent's
  // remit). They therefore REPRODUCE the bug: under the current unguarded code
  // the payload IS read after unmount, so the "expect 0 reads" assertion fails —
  // which is the documented, expected state. The moment a maintainer adds
  // `if (!isMounted.current) return;` to handleMessage, these assertions start
  // passing, `it.fails()` then ERRORS ("expected to fail but passed"), and the
  // suite goes red to say: bug fixed — flip `it.fails` back to `it`.
  // -------------------------------------------------------------------------

  // Build a payload object whose top-level fields are getter spies, so we can
  // observe whether handleMessage read the frame at all after unmount.
  function instrumentedPayload<T extends Record<string, unknown>>(
    values: T,
  ): { payload: T; reads: () => number } {
    const spies = Object.keys(values).map((k) => {
      const spy = vi.fn(() => values[k]);
      return [k, spy] as const;
    });
    const payload = {} as T;
    for (const [k, spy] of spies) {
      Object.defineProperty(payload, k, { get: spy, enumerable: true });
    }
    return {
      payload,
      reads: () => spies.reduce((n, [, spy]) => n + spy.mock.calls.length, 0),
    };
  }

  it.fails(
    'BUG-1: game_state_update frame read/applied after unmount (unguarded handleMessage)',
    async () => {
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

      // A late frame is delivered to the (now unmounted) provider. If
      // handleMessage early-returned on !isMounted, it would never read the
      // payload; the current unguarded code reads it and calls setGameState.
      const { payload, reads } = instrumentedPayload({
        gameId: 'ABCD',
        roomCode: 'ABCD',
        status: 'playing',
        players: { 'player-9': { name: 'Late', board: { tiles: [] } } },
        currentRound: 3,
      });

      act(() => {
        onMessage({ type: 'game_state_update', payload });
      });

      // Load-bearing: with an isMounted guard at the top of handleMessage this
      // is 0. Fails today because the callback is unguarded (BUG-1).
      expect(reads()).toBe(0);
      assertNoPostUnmountWarning();
    },
  );

  it.fails(
    'BUG-1: timer_tick frame read/applied after unmount (unguarded handleMessage)',
    async () => {
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

      // `timer_tick` -> setTimeRemaining(message.payload.timeRemaining): the
      // read of `.timeRemaining` only happens if handleMessage did not early-return.
      const { payload, reads } = instrumentedPayload({ timeRemaining: 42 });

      act(() => {
        onMessage({ type: 'timer_tick', payload });
      });

      expect(reads()).toBe(0);
      assertNoPostUnmountWarning();
    },
  );

  it.fails(
    'BUG-1: host_migrated frame read/applied after unmount (unguarded handleMessage)',
    async () => {
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

      // `host_migrated` destructures `{ newHostId } = message.payload` then
      // setGameState((prev) => ...). The `.newHostId` read is gated by the
      // top-of-handler early return the reviewer asked for.
      const { payload, reads } = instrumentedPayload({ newHostId: 'player-1' });

      act(() => {
        onMessage({ type: 'host_migrated', payload });
      });

      expect(reads()).toBe(0);
      assertNoPostUnmountWarning();
    },
  );
});

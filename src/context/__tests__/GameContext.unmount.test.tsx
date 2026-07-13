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

const getRoomMock = vi.fn();

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

// Capture the socket callbacks so the test can drive (re)connect — the OTHER
// place GameContext does an async setState after an await.
const connectOptions: {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
} = {};
const connectMock = vi.fn((options: typeof connectOptions) => {
  connectOptions.onConnect = options.onConnect;
  connectOptions.onDisconnect = options.onDisconnect;
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

    // Now the in-flight request resolves against a dead component tree. If the
    // guard were removed, the guarded setGameState would run here.
    await act(async () => {
      deferred.resolve(mockRoomResponse);
      await deferred.promise;
    });

    // The isMounted guard suppressed the post-await setState: no extra render.
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

    await act(async () => {
      deferred.resolve(mockRoomResponse);
      await Promise.resolve(onConnectDone);
    });

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
});

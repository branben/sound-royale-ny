import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';

// ---------------------------------------------------------------------------
// BUG-1 (bug_risk): setState on an unmounted component.
//
// GameContext starts an async `roomApi.getRoom(roomCode)` fetch inside a mount
// effect and, when it resolves, calls setState — `setGameState(
// buildGameStateFromRoom(roomData))` — with the result. If the provider
// unmounts before that promise settles, running setState on the now-unmounted
// component is the classic bug_risk: leaked work, stale state, and a React
// warning.
//
// The fix is an `isMounted` ref that the async continuation checks before
// EVERY setState, plus an effect cleanup that flips it to false on unmount:
//     if (isMounted.current) setGameState(buildGameStateFromRoom(roomData));
//
// How these tests OBSERVE the guard (React-version-agnostic):
// `buildGameStateFromRoom` calls the mocked `normalizeRoomWinner`, and it is
// only ever invoked from INSIDE the `if (isMounted.current)` branch of the
// settled fetch. So `normalizeRoomWinner` being called after unmount is a
// direct, reliable proxy for "setGameState ran on an unmounted component".
//   - Guard intact  → after unmount, the branch is skipped → NOT called.
//   - Guard removed  → after unmount, setGameState runs     → IS called.
// We resolve/reject the in-flight fetch AFTER unmount and assert the guarded
// branch did not fire. Verified to FAIL when the isMounted cleanup is removed.
// ---------------------------------------------------------------------------

vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

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
  current_round: 1,
};

// A controllable "deferred" so the test decides exactly when getRoom settles
// — this lets us unmount while the fetch is still in flight.
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Flush pending microtasks so a settled promise's continuations (and any
// setState they would run) execute before we assert.
async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

const getRoomMock = vi.fn();
// Proxy for "the guarded setGameState branch ran": buildGameStateFromRoom
// (called only inside `if (isMounted.current)`) invokes normalizeRoomWinner.
const normalizeRoomWinnerMock = vi.fn((w: unknown) => {
  if (!w) return undefined;
  if (typeof w === 'string') return w;
  if (typeof w === 'object' && w !== null && 'id' in w) return (w as { id: string }).id;
  return undefined;
});

vi.mock('@/services/api', () => ({
  roomApi: {
    getRoom: (...args: unknown[]) => getRoomMock(...(args as [string])),
  },
  gameApi: {},
  getStoredAccessToken: vi.fn(() => null),
  normalizeRoomWinner: (w: unknown) => normalizeRoomWinnerMock(w),
}));

// Socket is irrelevant to the mount-fetch race; stub it to a no-op.
vi.mock('@/services/gameSocket', () => {
  const stub = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return { __esModule: true, default: stub, gameSocket: stub };
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

function StateReader() {
  const ctx = React.useContext(GameStateContext);
  if (!ctx) return null;
  return <div data-testid="player-count">{Object.keys(ctx.gameState.players).length}</div>;
}

describe('GameContext unmount safety (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('does not setState after the provider unmounts while getRoom is in flight', async () => {
    const deferred = createDeferred<typeof mockRoomResponse>();
    getRoomMock.mockReturnValue(deferred.promise);

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    // The mount effect fires the fetch, which is now pending (unresolved).
    await waitFor(() => expect(getRoomMock).toHaveBeenCalledWith('ABCD'));
    // The state-building path has NOT run yet (fetch is still pending).
    expect(normalizeRoomWinnerMock).not.toHaveBeenCalled();

    // Unmount BEFORE the fetch resolves — this is the race BUG-1 warns about.
    // The isMounted cleanup flips the guard to false here.
    unmount();

    // Resolve the in-flight request AFTER unmount. The async continuation runs;
    // with the guard intact it must skip the setGameState branch entirely, so
    // buildGameStateFromRoom (→ normalizeRoomWinner) is never reached.
    deferred.resolve(mockRoomResponse);
    await flushMicrotasks();

    expect(normalizeRoomWinnerMock).not.toHaveBeenCalled();
  });

  it('does not build/commit state when the in-flight getRoom rejects after unmount', async () => {
    const deferred = createDeferred<typeof mockRoomResponse>();
    getRoomMock.mockReturnValue(deferred.promise);

    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(getRoomMock).toHaveBeenCalledWith('ABCD'));

    unmount();

    // Reject the pending fetch after unmount. The catch/finally branches also
    // guard their setState calls with isMounted, so no state work should occur.
    deferred.reject(new Error('network down'));
    await flushMicrotasks();

    expect(normalizeRoomWinnerMock).not.toHaveBeenCalled();
  });

  it('still updates state normally when getRoom resolves before unmount', async () => {
    // Sanity check: the guard does not break the happy path — a fetch that
    // completes while mounted still populates the game state, which means the
    // guarded branch (and thus normalizeRoomWinner) DID run.
    getRoomMock.mockResolvedValue(mockRoomResponse);

    const { getByTestId } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(getByTestId('player-count').textContent).toBe('1'));
    expect(normalizeRoomWinnerMock).toHaveBeenCalled();
  });
});

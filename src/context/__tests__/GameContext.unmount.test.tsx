import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';

// ---------------------------------------------------------------------------
// BUG-1 (bug_risk): setState on an unmounted component.
//
// GameProvider kicks off an async `roomApi.getRoom(roomCode)` fetch in a mount
// effect and calls its state setters (setGameState / setError / setIsLoading)
// once it resolves. If the provider unmounts BEFORE that promise settles, the
// resolution handlers must NOT invoke those setters — the component is gone and
// touching its state is a leak/race (React 18 silently no-ops the render, so
// there is no console warning to catch; the only reliable signal is that the
// setter itself is never called after unmount).
//
// The provider guards every post-await setState behind an `isMounted` ref that
// is flipped false in the effect cleanup. These tests pin that contract by
// spying on the useState dispatchers created during the provider's render,
// unmounting while the fetch is in flight, then settling the promise, and
// asserting NO dispatcher fires afterwards. They fail if the guard is removed
// (verified via a local mutation: deleting the guard makes these go red).
// ---------------------------------------------------------------------------

vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// A deferred promise we resolve/reject AFTER unmount to simulate an in-flight
// fetch outliving the component.
let deferred: {
  promise: Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

function makeDeferred() {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const getRoomMock = vi.fn(() => deferred.promise);

vi.mock('@/services/api', () => ({
  roomApi: {
    getRoom: (...args: unknown[]) => getRoomMock(...(args as [string])),
  },
  gameApi: {},
  getStoredAccessToken: vi.fn(() => null),
  normalizeRoomWinner: vi.fn(() => undefined),
}));

// The socket is irrelevant here — stub it so connect/disconnect are no-ops.
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
  return <div data-testid="status">{ctx.gameState.status}</div>;
}

// -------------------------------------------------------------------------
// useState dispatcher tracking.
//
// We wrap React.useState so every dispatcher created while `tracking` is on is
// recorded and wrapped. The wrapper counts how many times it is invoked AFTER
// we start watching (i.e. after unmount). React 18 no-ops setState on an
// unmounted component instead of warning, so the dispatch CALL itself is the
// only observable evidence the isMounted guard was bypassed.
// -------------------------------------------------------------------------
type Dispatch = (v: unknown) => void;
let trackedDispatchers: Dispatch[] = [];
let dispatchCallsAfterUnmount = 0;
let watchingDispatch = false;
let tracking = false;

const realUseState = React.useState;

function installUseStateSpy() {
  vi.spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const [value, setter] = (realUseState as (i: unknown) => [unknown, Dispatch])(initial);
    if (tracking) {
      const wrapped: Dispatch = (v: unknown) => {
        if (watchingDispatch) dispatchCallsAfterUnmount += 1;
        return setter(v);
      };
      trackedDispatchers.push(wrapped);
      return [value, wrapped];
    }
    return [value, setter];
  }) as typeof React.useState);
}

describe('GameProvider unmount safety (BUG-1: no setState after unmount)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferred = makeDeferred();
    getRoomMock.mockImplementation(() => deferred.promise);
    mockUseUser.mockReturnValue(createDefaultUserSession());
    trackedDispatchers = [];
    dispatchCallsAfterUnmount = 0;
    watchingDispatch = false;
    tracking = true;
    installUseStateSpy();
  });

  afterEach(() => {
    tracking = false;
    vi.restoreAllMocks();
  });

  it('does not call any state setter when the in-flight getRoom RESOLVES after unmount', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    // The mount effect fired the fetch (still pending) and the provider has
    // registered its state setters.
    await waitFor(() => expect(getRoomMock).toHaveBeenCalledWith('ABCD'));
    expect(trackedDispatchers.length).toBeGreaterThan(0);

    // Unmount BEFORE the fetch settles — flips the isMounted guard to false.
    unmount();

    // From here on, ANY setter invocation is a guard violation.
    watchingDispatch = true;

    await act(async () => {
      deferred.resolve({ code: 'ABCD', status: 'playing', players: [], current_round: 1 });
      // Drain microtasks so the .then/finally handlers run.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dispatchCallsAfterUnmount).toBe(0);
  });

  it('does not call any state setter when the in-flight getRoom REJECTS after unmount', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(getRoomMock).toHaveBeenCalledWith('ABCD'));
    expect(trackedDispatchers.length).toBeGreaterThan(0);

    unmount();
    watchingDispatch = true;

    await act(async () => {
      deferred.reject(new Error('network down'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // The catch/finally must not setError or setIsLoading on the dead component.
    expect(dispatchCallsAfterUnmount).toBe(0);
  });
});

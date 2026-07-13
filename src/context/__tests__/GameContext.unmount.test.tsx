import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import { roomApi, normalizeRoomWinner } from '@/services/api';

// Mock the UserContext
vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// Mock the API module. `getRoom` is overridden per-test with a controllable
// promise. `normalizeRoomWinner` is our probe: GameProvider only calls it
// (via buildGameStateFromRoom) INSIDE the `isMounted` guard on the fetch
// success path, so a call after unmount would mean the guard leaked.
vi.mock('@/services/api', () => ({
  getStoredAccessToken: vi.fn(() => null),
  roomApi: {
    getRoom: vi.fn(),
  },
  gameApi: {},
  normalizeRoomWinner: vi.fn((w: unknown) => {
    if (!w) return undefined;
    if (typeof w === 'string') return w;
    if (typeof w === 'object' && w !== null && 'id' in w) return (w as { id: string }).id;
    return undefined;
  }),
}));

// Mock the gameSocket module so the WS effect is inert.
vi.mock('@/services/gameSocket', () => ({
  __esModule: true,
  default: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  },
  gameSocket: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(
      ({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) =>
        React.createElement('div', { ...props, ref }, children as React.ReactNode),
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const mockUseUser = useUser as unknown as ReturnType<typeof vi.fn>;
const mockGetRoom = roomApi.getRoom as unknown as ReturnType<typeof vi.fn>;
const mockNormalizeRoomWinner = normalizeRoomWinner as unknown as ReturnType<typeof vi.fn>;

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

function roomResponse(code: string) {
  return { code, players: [], status: 'lobby', current_round: 0, winner: null };
}

/**
 * Regression test for a setState-on-unmounted-component bug in GameProvider.
 *
 * GameProvider fires an async fetch (`roomApi.getRoom`) on mount. If the
 * provider unmounts before that promise settles, settling it afterward must
 * NOT run the state-writing branch of the effect — otherwise React state is
 * written to an unmounted tree (the classic "Can't perform a React state
 * update on an unmounted component" leak).
 *
 * React 18+ silently no-ops such updates rather than warning, so a
 * console-warning assertion alone would not fail when the guard is removed.
 * Instead these tests probe the guard *directly*: on the success path the
 * provider builds the next state via `buildGameStateFromRoom`, which calls
 * `normalizeRoomWinner`. That call sits INSIDE the `isMounted` guard, so:
 *   - guard intact  -> resolving after unmount never calls normalizeRoomWinner
 *   - guard removed -> resolving after unmount DOES call it (test fails)
 * This makes the test genuinely fail if the isMounted guard regresses, and it
 * is independent of React's version-specific warning behavior. We also assert
 * React logged no unmounted-component warning as a secondary signal.
 */
describe('GameProvider — no setState after unmount', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUser.mockReturnValue(createDefaultUserSession());
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function unmountedWarningCalls() {
    return consoleErrorSpy.mock.calls.filter((args) =>
      args.some(
        (arg) =>
          typeof arg === 'string' &&
          (arg.toLowerCase().includes('unmounted component') ||
            arg.toLowerCase().includes("can't perform a react state update") ||
            arg.toLowerCase().includes('memory leak')),
      ),
    );
  }

  it('does not build/commit state when the in-flight fetch resolves after unmount', async () => {
    // A promise we resolve manually AFTER unmount.
    let resolveGetRoom!: (value: unknown) => void;
    mockGetRoom.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGetRoom = resolve;
        }),
    );

    const { unmount } = render(<GameProvider roomCode="ABCD">{null}</GameProvider>);

    // getRoom is pending; tear the provider down before it resolves.
    expect(mockGetRoom).toHaveBeenCalledWith('ABCD');
    unmount();

    // Sanity: nothing has been built yet.
    mockNormalizeRoomWinner.mockClear();

    // Resolve the stale fetch. With the isMounted guard, the success branch
    // (buildGameStateFromRoom -> normalizeRoomWinner -> setGameState) is skipped.
    await act(async () => {
      resolveGetRoom(roomResponse('ABCD'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // The guard must have prevented the post-unmount state build entirely.
    expect(mockNormalizeRoomWinner).not.toHaveBeenCalled();
    expect(unmountedWarningCalls()).toEqual([]);
  });

  it('does not setState when the in-flight fetch rejects after unmount', async () => {
    let rejectGetRoom!: (reason: unknown) => void;
    mockGetRoom.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectGetRoom = reject;
        }),
    );

    const { unmount } = render(<GameProvider roomCode="WXYZ">{null}</GameProvider>);

    expect(mockGetRoom).toHaveBeenCalledWith('WXYZ');
    unmount();

    // Reject the stale fetch after unmount. The catch/finally setError/setIsLoading
    // calls are also guarded, so no unmounted-component warning should fire.
    await act(async () => {
      rejectGetRoom(new Error('network down'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unmountedWarningCalls()).toEqual([]);
  });

  it('DOES build state when the fetch resolves while still mounted (guard is not over-eager)', async () => {
    // Guard against a false-positive fix that simply never commits: while
    // mounted, resolving the fetch must still build the next state.
    let resolveGetRoom!: (value: unknown) => void;
    mockGetRoom.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGetRoom = resolve;
        }),
    );

    render(<GameProvider roomCode="ABCD">{null}</GameProvider>);
    expect(mockGetRoom).toHaveBeenCalledWith('ABCD');
    mockNormalizeRoomWinner.mockClear();

    await act(async () => {
      resolveGetRoom(roomResponse('ABCD'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Still mounted -> state was built from the response.
    expect(mockNormalizeRoomWinner).toHaveBeenCalled();
  });
});

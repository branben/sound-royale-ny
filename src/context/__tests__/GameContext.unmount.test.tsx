import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// BUG-1 regression guard (PR #177 review comment r3571768690)
//
// The socket message handler (`handleMessage`) in GameContext processes
// `game_state_update`, `timer_tick`, and `host_migrated` messages and calls
// setState WITHOUT an `isMounted.current` guard. If a socket frame is delivered
// to the captured `onMessage` callback after the GameProvider has unmounted
// (e.g. an in-flight frame arriving during teardown), those setState calls fire
// on an unmounted component — the classic "setState on unmounted component"
// bug the reviewer flagged.
//
// React 18 no longer prints the old "state update on an unmounted component"
// console warning, so asserting on that string is NOT a reliable guard. Instead
// these tests exploit a deterministic, observable fact: the handler only
// *reads the message payload* (to build the next state) when it actually
// proceeds to update state. With an early `if (!isMounted.current) return;`
// guard the handler bails out before touching the payload; without the guard it
// reads the payload to compute the new state.
//
// So we hand `onMessage` a payload whose fields are instrumented getters and,
// after unmount, assert those getters are NEVER read. This FAILS against the
// current (un-guarded) code — the getter fires — and PASSES once the early
// `if (!isMounted.current) return;` guard is added to `handleMessage`.
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
      board: {
        tiles: [{ id: 'tile-1', genre: 'House', status: 'complete' as const }],
      },
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

// Capture the live socket callbacks so a frame can be delivered to the
// component's handler AFTER it has unmounted (mirroring an in-flight socket
// message that arrives during teardown).
const socketCallbacks: {
  onMessage?: (message: GameSocketMessage) => void;
} = {};
const connectMock = vi.fn((options: { onMessage?: (m: GameSocketMessage) => void }) => {
  socketCallbacks.onMessage = options.onMessage;
});

vi.mock('@/services/gameSocket', () => {
  const impl = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: { onMessage?: (m: GameSocketMessage) => void }) => void)(
        ...(args as [{ onMessage?: (m: GameSocketMessage) => void }]),
      ),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return { __esModule: true, default: impl, gameSocket: impl };
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
  return (
    <div>
      <div data-testid="status">{ctx.gameState.status}</div>
      <div data-testid="current-round">{ctx.gameState.currentRound}</div>
    </div>
  );
}

describe('GameContext — socket message after unmount (BUG-1 guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketCallbacks.onMessage = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  async function mountAndUnmount() {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    // Wait for the socket to connect and register the message handler.
    await waitFor(() => expect(socketCallbacks.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('playing'));

    // Tear the provider down. The effect cleanup runs and sets
    // isMounted.current = false; a well-behaved handler must now ignore frames.
    act(() => {
      unmount();
    });
  }

  it('ignores a game_state_update delivered after unmount (does not process payload / setState)', async () => {
    await mountAndUnmount();

    // A payload whose `players` field is only read when the handler proceeds to
    // build the next state. If the mounted guard is missing, the handler reads
    // it after unmount → setState on an unmounted component.
    const payloadTouched = vi.fn();
    const instrumentedPayload = {
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'voting',
      currentRound: 999,
      get players() {
        payloadTouched();
        return {};
      },
    };

    expect(() =>
      act(() => {
        socketCallbacks.onMessage!({
          type: 'game_state_update',
          payload: instrumentedPayload as unknown as GameSocketMessage extends {
            type: 'game_state_update';
            payload: infer P;
          }
            ? P
            : never,
        });
      }),
    ).not.toThrow();

    // With the isMounted guard the handler returns before touching the payload.
    expect(payloadTouched).not.toHaveBeenCalled();
  });

  it('ignores a timer_tick delivered after unmount', async () => {
    await mountAndUnmount();

    const timeRead = vi.fn();
    const payload = {
      get timeRemaining() {
        timeRead();
        return 42;
      },
    };

    expect(() =>
      act(() => {
        socketCallbacks.onMessage!({
          type: 'timer_tick',
          payload: payload as unknown as { timeRemaining: number },
        });
      }),
    ).not.toThrow();

    // Guarded handler bails out before reading the tick payload / calling
    // setTimeRemaining on the unmounted component.
    expect(timeRead).not.toHaveBeenCalled();
  });

  it('ignores a host_migrated delivered after unmount', async () => {
    await mountAndUnmount();

    const hostRead = vi.fn();
    const payload = {
      get newHostId() {
        hostRead();
        return 'player-1';
      },
      newHostName: 'TestPlayer',
    };

    expect(() =>
      act(() => {
        socketCallbacks.onMessage!({
          type: 'host_migrated',
          payload: payload as unknown as { newHostId: string; newHostName: string },
        });
      }),
    ).not.toThrow();

    // Guarded handler bails out before reading newHostId / calling setGameState
    // on the unmounted component.
    expect(hostRead).not.toHaveBeenCalled();
  });
});

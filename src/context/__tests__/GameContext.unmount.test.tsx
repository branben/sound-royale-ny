import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider } from '../GameContext';
import { useUser } from '../UserContext';
import type { GameSocketMessage } from '@/services/gameSocket';

// ---------------------------------------------------------------------------
// BUG-1 regression: the WebSocket callbacks must not run their setState work
// after the GameProvider has unmounted.
//
// A queued/in-flight socket frame can invoke the message/connect handlers after
// the component is gone (e.g. the user navigates away mid disconnect→reconnect).
// Without an `isMounted.current` guard, those handlers still execute — the
// reconnect handler even fires a fresh `roomApi.getRoom(...)` re-fetch and then
// calls `setGameState` on the dead component. React 18 no longer *warns* about
// setState-after-unmount, so we assert the observable side effect instead: a
// reconnect that fires after unmount must NOT trigger another `getRoom` fetch.
//
// Fails today (the reconnect handler re-fetches after unmount); passes once
// `if (!isMounted.current) return;` guards the socket callbacks.
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

// Capture the socket callbacks so the test can drive messages/connect/disconnect.
const connectOptions: {
  onMessage?: (m: GameSocketMessage) => void;
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
} = {};
const connectMock = vi.fn((options: typeof connectOptions) => {
  connectOptions.onMessage = options.onMessage;
  connectOptions.onConnect = options.onConnect;
  connectOptions.onDisconnect = options.onDisconnect;
});
const disconnectMock = vi.fn();

vi.mock('@/services/gameSocket', () => {
  const api = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof connectOptions) => void)(...(args as [typeof connectOptions])),
    disconnect: (...args: unknown[]) => disconnectMock(...args),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  return { __esModule: true, default: api, gameSocket: api };
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

describe('GameContext unmount safety (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.onMessage = undefined;
    connectOptions.onConnect = undefined;
    connectOptions.onDisconnect = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  it('does not re-fetch room state when a reconnect fires after the provider unmounts', async () => {
    const { unmount } = render(<GameProvider roomCode="ABCD" />);

    // Wait for the socket to connect and the initial mount fetch to settle.
    await waitFor(() => expect(connectOptions.onConnect).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    const onConnect = connectOptions.onConnect!;
    const callsBeforeUnmount = getRoomMock.mock.calls.length;

    // Unmount the provider — cleanup sets isMounted.current = false and
    // disconnects the socket.
    unmount();

    // A queued reconnect frame fires AFTER unmount. This is the BUG-1 path:
    // the onConnect handler runs refreshRoomState() -> roomApi.getRoom(), then
    // setGameState, on the dead component. With the isMounted guard it must
    // bail early and NOT re-fetch.
    await act(async () => {
      await onConnect();
    });

    expect(getRoomMock.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it('does not re-fetch when a reconnect fires after unmount during a disconnect window', async () => {
    const { unmount } = render(<GameProvider roomCode="ABCD" />);

    await waitFor(() => expect(connectOptions.onDisconnect).toBeTypeOf('function'));
    await waitFor(() => expect(connectOptions.onConnect).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    const onDisconnect = connectOptions.onDisconnect!;
    const onConnect = connectOptions.onConnect!;
    const callsBeforeUnmount = getRoomMock.mock.calls.length;

    // Disconnect opens the reconnect window, then the component unmounts (user
    // navigates away) before reconnect completes.
    act(() => onDisconnect('connection lost'));
    unmount();

    // Late reconnect fires after unmount — must not re-fetch on a dead component.
    await act(async () => {
      await onConnect();
    });

    expect(getRoomMock.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it('ignores a stray socket message received after the provider unmounts', async () => {
    const { unmount } = render(<GameProvider roomCode="ABCD" />);

    await waitFor(() => expect(connectOptions.onMessage).toBeTypeOf('function'));
    await waitFor(() => expect(getRoomMock).toHaveBeenCalled());

    const onMessage = connectOptions.onMessage!;
    const callsBeforeUnmount = getRoomMock.mock.calls.length;

    unmount();

    // A stray timer tick + game_state_update arrive after unmount. The guarded
    // handler must ignore them: no crash and no further getRoom re-fetch.
    expect(() => {
      act(() => {
        onMessage({ type: 'timer_tick', payload: { timeRemaining: 42 } });
      });
      act(() => {
        onMessage({
          type: 'game_state_update',
          payload: {
            gameId: 'ABCD',
            roomCode: 'ABCD',
            status: 'playing',
            players: {},
            currentRound: 3,
          },
        } as GameSocketMessage);
      });
    }).not.toThrow();

    expect(getRoomMock.mock.calls.length).toBe(callsBeforeUnmount);
  });
});

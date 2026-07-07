import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider, GameContext } from '../GameContext';
import { useUser } from '../UserContext';
import { roomApi } from '@/services/api';

// Mock the UserContext
vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

// Capture the options object passed to gameSocket.connect so the test can
// invoke onConnect / onDisconnect the way the real socket service would.
const connectOptions: Array<{
  onConnect?: () => Promise<void> | void;
  onDisconnect?: (reason: string) => void;
}> = [];

// Mock the API module
vi.mock('@/services/api', () => ({
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
  getStoredAccessToken: vi.fn(() => null),
}));

// Mock the gameSocket module capturing connect options
vi.mock('@/services/gameSocket', () => ({
  __esModule: true,
  default: {
    connect: vi.fn((options: { onConnect?: () => void; onDisconnect?: (r: string) => void }) => {
      connectOptions.push(options);
    }),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  },
  gameSocket: {
    connect: vi.fn((options: { onConnect?: () => void; onDisconnect?: (r: string) => void }) => {
      connectOptions.push(options);
    }),
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
const getRoom = roomApi.getRoom as unknown as ReturnType<typeof vi.fn>;

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

function makeRoomResponse(overrides: Record<string, unknown> = {}) {
  return {
    code: 'ABCD',
    status: 'playing' as const,
    current_round: 3,
    players: [
      {
        id: 'player-1',
        name: 'TestPlayer',
        board: { tiles: [{ id: 'tile-1', genre: 'House', status: 'empty' as const }] },
      },
      {
        id: 'player-2',
        name: 'OtherPlayer',
        board: { tiles: [{ id: 'tile-2', genre: 'Techno', status: 'complete' as const }] },
      },
    ],
    ...overrides,
  };
}

function ContextReader() {
  const ctx = React.useContext(GameContext);
  if (!ctx) return null;
  return (
    <div>
      <div data-testid="status">{ctx.gameState.status}</div>
      <div data-testid="current-round">{ctx.gameState.currentRound}</div>
      <div data-testid="player-count">{Object.keys(ctx.gameState.players).length}</div>
    </div>
  );
}

describe('GameContext WebSocket reconnect (guardrail #101)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectOptions.length = 0;
    mockUseUser.mockReturnValue(createDefaultUserSession());
    getRoom.mockResolvedValue(makeRoomResponse());
  });

  function lastConnectOptions() {
    expect(connectOptions.length).toBeGreaterThan(0);
    return connectOptions[connectOptions.length - 1];
  }

  it('re-fetches full room state (replacing, not merging) when onConnect fires', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <ContextReader />
      </GameProvider>,
    );

    // Initial mount fetch resolves.
    await waitFor(() => expect(getRoom).toHaveBeenCalled());

    // Simulate a reconnect: socket service calls onConnect after reopening.
    await act(async () => {
      await lastConnectOptions().onConnect?.();
    });

    // Full playing-room state replaces the initial state.
    expect(screen.getByTestId('status').textContent).toBe('playing');
    expect(screen.getByTestId('current-round').textContent).toBe('3');
    expect(screen.getByTestId('player-count').textContent).toBe('2');
  });

  it('does not merge a stale partial board — reconnect replaces all players', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <ContextReader />
      </GameProvider>,
    );

    await waitFor(() => expect(getRoom).toHaveBeenCalledTimes(1));

    // A different player set comes back on reconnect.
    getRoom.mockResolvedValueOnce(
      makeRoomResponse({
        players: [
          { id: 'player-1', name: 'TestPlayer', board: { tiles: [] } },
          { id: 'player-3', name: 'NewPlayer', board: { tiles: [] } },
        ],
      }),
    );

    await act(async () => {
      await lastConnectOptions().onConnect?.();
    });

    // player-2 must be gone (replaced, not merged) and player-3 present.
    expect(screen.getByTestId('player-count').textContent).toBe('2');
  });

  it('shows the Reconnecting banner during disconnect and hides it after reconnect', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <ContextReader />
      </GameProvider>,
    );

    await waitFor(() => expect(getRoom).toHaveBeenCalled());

    // Disconnect → banner visible.
    await act(async () => {
      lastConnectOptions().onDisconnect?.('connection lost');
    });
    expect(screen.getByTestId('reconnecting-banner')).toBeTruthy();

    // Reconnect → banner hidden, getRoom called again.
    await act(async () => {
      await lastConnectOptions().onConnect?.();
    });
    expect(screen.queryByTestId('reconnecting-banner')).toBeNull();
    expect(getRoom).toHaveBeenCalledTimes(2);
  });

  it('onConnect is wired (not empty) and calls getRoom on reconnect', async () => {
    render(
      <GameProvider roomCode="ABCD">
        <ContextReader />
      </GameProvider>,
    );

    await waitFor(() => expect(getRoom).toHaveBeenCalledTimes(1));

    const callsBefore = getRoom.mock.calls.length;
    await act(async () => {
      await lastConnectOptions().onConnect?.();
    });

    expect(getRoom.mock.calls.length).toBe(callsBefore + 1);
  });
});

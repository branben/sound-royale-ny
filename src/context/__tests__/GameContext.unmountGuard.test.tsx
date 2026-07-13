import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameProvider, GameStateContext } from '../GameContext';
import { useUser } from '../UserContext';

// ---------------------------------------------------------------------------
// BUG-1 (bug_risk) regression test.
//
// The WebSocket message callback (`handleMessage`, wired as the socket
// `onMessage`) mutates React state via setGameState/setTimeRemaining. If a
// socket frame is delivered AFTER the GameProvider unmounts — a real race, since
// the transport can flush a buffered/late frame during teardown — those setState
// calls run on an unmounted component.
//
// The fix is an `if (!isMounted.current) return;` early return at the TOP of the
// socket message callback, before it reads the payload or touches state.
//
// How this test detects the bug without relying on a React warning:
//   React 18 no longer logs "setState on an unmounted component", so a
//   console.error probe is not a reliable signal. Instead we make the message
//   `payload` a GETTER that records when it is accessed. The callback reads
//   `message.payload` as its very first step in each state-mutating branch, so:
//     - guard present  → callback early-returns, payload getter is NEVER read
//     - guard missing  → callback runs its body and reads the payload (and would
//                         call setGameState/setTimeRemaining on the dead component)
//   The test fails (payload was read after unmount) if the guard is absent.
//
// A positive control ("still applies updates while mounted") ensures the guard
// does not over-block live messages.
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
      board: { tiles: [{ id: 'tile-1', genre: 'House', status: 'complete' as const }] },
    },
  ],
  current_round: 1,
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

// Capture the socket callbacks so the test can drive onMessage directly.
type MessageHandler = (message: unknown) => void;
const socketCallbacks: {
  onMessage?: MessageHandler;
  onConnect?: () => void | Promise<void>;
  onDisconnect?: (r: string) => void;
} = {};

const connectMock = vi.fn((options: typeof socketCallbacks) => {
  socketCallbacks.onMessage = options.onMessage;
  socketCallbacks.onConnect = options.onConnect;
  socketCallbacks.onDisconnect = options.onDisconnect;
});

vi.mock('@/services/gameSocket', () => {
  const impl = {
    connect: (...args: unknown[]) =>
      (connectMock as (o: typeof socketCallbacks) => void)(...(args as [typeof socketCallbacks])),
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
  return <div data-testid="status">{ctx.gameState.status}</div>;
}

// Build a socket message whose `payload` is a getter that flips `read.value` the
// first time the callback dereferences it. `handleMessage` reads message.payload
// at the very top of each state-mutating branch, so a read == "callback body ran".
function messageWithPayloadProbe(
  type: string,
  payload: unknown,
): { message: unknown; read: { value: boolean } } {
  const read = { value: false };
  const message = {
    type,
    get payload() {
      read.value = true;
      return payload;
    },
  };
  return { message, read };
}

describe('GameContext socket callback unmount guard (BUG-1)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    socketCallbacks.onMessage = undefined;
    socketCallbacks.onConnect = undefined;
    socketCallbacks.onDisconnect = undefined;
    getRoomMock.mockResolvedValue(mockRoomResponse);
    mockUseUser.mockReturnValue(createDefaultUserSession());
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('ignores a game_state_update delivered after unmount (guard short-circuits the callback)', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(socketCallbacks.onMessage).toBeTypeOf('function'));

    const onMessage = socketCallbacks.onMessage!;
    unmount();

    const { message, read } = messageWithPayloadProbe('game_state_update', {
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'voting',
      players: { 'player-1': { name: 'TestPlayer', board: { tiles: [] } } },
      currentRound: 5,
    });

    // A late/buffered socket frame arrives after unmount.
    expect(() => {
      act(() => {
        onMessage(message);
      });
    }).not.toThrow();

    // The guard must early-return BEFORE the callback reads the payload / calls
    // setGameState. If the payload was read, the callback body ran on an
    // unmounted component — the exact BUG-1 setState-after-unmount hazard.
    expect(
      read.value,
      'socket game_state_update after unmount executed the callback body (read payload / setGameState) ' +
        'on an unmounted component — add `if (!isMounted.current) return;` to the socket message callback',
    ).toBe(false);
  });

  it('ignores a timer_tick delivered after unmount (guard short-circuits the callback)', async () => {
    const { unmount } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(socketCallbacks.onMessage).toBeTypeOf('function'));

    const onMessage = socketCallbacks.onMessage!;
    unmount();

    const { message, read } = messageWithPayloadProbe('timer_tick', { timeRemaining: 42 });

    expect(() => {
      act(() => {
        onMessage(message);
      });
    }).not.toThrow();

    expect(
      read.value,
      'socket timer_tick after unmount executed the callback body (setTimeRemaining) on an unmounted ' +
        'component — add `if (!isMounted.current) return;` to the socket message callback',
    ).toBe(false);
  });

  it('still applies socket updates normally while mounted (guard does not block live messages)', async () => {
    const { getByTestId } = render(
      <GameProvider roomCode="ABCD">
        <StateReader />
      </GameProvider>,
    );

    await waitFor(() => expect(socketCallbacks.onMessage).toBeTypeOf('function'));

    // Positive control: while mounted, a game_state_update IS applied and its
    // payload IS read — proving the guard only blocks post-unmount delivery.
    const { message, read } = messageWithPayloadProbe('game_state_update', {
      gameId: 'ABCD',
      roomCode: 'ABCD',
      status: 'voting',
      players: { 'player-1': { name: 'TestPlayer', board: { tiles: [] } } },
      currentRound: 5,
    });

    act(() => {
      socketCallbacks.onMessage!(message);
    });

    expect(read.value).toBe(true);
    await waitFor(() => expect(getByTestId('status').textContent).toBe('voting'));

    const unmountedUpdate = consoleErrorSpy.mock.calls.find((args) =>
      /unmounted component/i.test(args.map(String).join(' ')),
    );
    expect(unmountedUpdate).toBeUndefined();
  });
});

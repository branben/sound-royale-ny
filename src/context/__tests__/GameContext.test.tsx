import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GameProvider,
  GameContext,
  GameStateContext,
  GameTimerContext,
  GameActionsContext,
} from '../GameContext';
import { useUser } from '../UserContext';

// Mock the UserContext
vi.mock('../UserContext', () => ({
  useUser: vi.fn(),
}));

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
}));

// Mock the gameSocket module
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

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) =>
      React.createElement('div', { ...props, ref }, children)
    ),
    button: React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLButtonElement>) =>
      React.createElement('button', { ...props, ref }, children)
    ),
    span: React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLSpanElement>) =>
      React.createElement('span', { ...props, ref }, children)
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

// Helper component that reads the legacy combined context
function LegacyContextReader() {
  const ctx = React.useContext(GameContext);
  if (!ctx) return null;
  return (
    <div>
      <div data-testid="status">{ctx.gameState.status}</div>
      <div data-testid="player-count">{Object.keys(ctx.gameState.players).length}</div>
      <div data-testid="current-round">{ctx.gameState.currentRound}</div>
      <div data-testid="is-loading">{String(ctx.isLoading)}</div>
      <div data-testid="error">{ctx.error ?? 'none'}</div>
      <div data-testid="room-code">{ctx.roomCode ?? 'none'}</div>
      <div data-testid="time-remaining">{ctx.timeRemaining ?? 'none'}</div>
    </div>
  );
}

// Helper component that reads the split state context
function StateContextReader() {
  const ctx = React.useContext(GameStateContext);
  if (!ctx) return null;
  return (
    <div>
      <div data-testid="state-status">{ctx.gameState.status}</div>
      <div data-testid="state-player-count">{Object.keys(ctx.gameState.players).length}</div>
      <div data-testid="state-is-loading">{String(ctx.isLoading)}</div>
      <div data-testid="state-error">{ctx.error ?? 'none'}</div>
    </div>
  );
}

// Helper component that reads the timer context
function TimerContextReader() {
  const ctx = React.useContext(GameTimerContext);
  if (!ctx) return null;
  return (
    <div>
      <div data-testid="timer-value">{ctx.timeRemaining ?? 'none'}</div>
    </div>
  );
}

// Helper component that reads the actions context
function ActionsContextReader() {
  const ctx = React.useContext(GameActionsContext);
  if (!ctx) return null;
  return (
    <div>
      <div data-testid="actions-available">
        {ctx.updateTileStatus && ctx.setTileAudio && ctx.toggleReady && ctx.incrementScore
          ? 'yes'
          : 'no'}
      </div>
    </div>
  );
}

describe('GameContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUser.mockReturnValue(createDefaultUserSession());
  });

  describe('initial state', () => {
    it('provides empty game state when not in E2E mode', () => {
      render(
        <GameProvider roomCode="ABCD">
          <LegacyContextReader />
        </GameProvider>
      );

      expect(screen.getByTestId('status').textContent).toBe('lobby');
      expect(screen.getByTestId('player-count').textContent).toBe('0');
      expect(screen.getByTestId('current-round').textContent).toBe('0');
      // isLoading may be true because the fetch effect fires immediately
      expect(screen.getByTestId('error').textContent).toBe('none');
    });

    it('provides roomCode from props', () => {
      render(
        <GameProvider roomCode="ABCD">
          <LegacyContextReader />
        </GameProvider>
      );

      expect(screen.getByTestId('room-code').textContent).toBe('ABCD');
    });

    it('sets error when roomCode is empty', () => {
      render(
        <GameProvider>
          <LegacyContextReader />
        </GameProvider>
      );

      expect(screen.getByTestId('error').textContent).toBe('Room code is required');
    });

    it('provides null timeRemaining initially', () => {
      render(
        <GameProvider roomCode="ABCD">
          <LegacyContextReader />
        </GameProvider>
      );

      expect(screen.getByTestId('time-remaining').textContent).toBe('none');
    });
  });

  describe('split contexts', () => {
    it('GameStateContext provides game state independently', () => {
      render(
        <GameProvider roomCode="ABCD">
          <StateContextReader />
        </GameProvider>
      );

      expect(screen.getByTestId('state-status').textContent).toBe('lobby');
      expect(screen.getByTestId('state-player-count').textContent).toBe('0');
    });

    it('GameTimerContext provides timeRemaining independently', () => {
      render(
        <GameProvider roomCode="ABCD">
          <TimerContextReader />
        </GameProvider>
      );

      expect(screen.getByTestId('timer-value').textContent).toBe('none');
    });

    it('GameActionsContext provides all action callbacks', () => {
      render(
        <GameProvider roomCode="ABCD">
          <ActionsContextReader />
        </GameProvider>
      );

      expect(screen.getByTestId('actions-available').textContent).toBe('yes');
    });
  });

  describe('actions via legacy context', () => {
    it('updateTileStatus updates a tile status for a player', () => {
      function TestComponent() {
        const ctx = React.useContext(GameContext);
        if (!ctx) return null;

        // Set up initial state with a player that has tiles
        React.useEffect(() => {
          ctx.setGameState(prev => ({
            ...prev,
            players: {
              'player-1': {
                id: 'player-1',
                name: 'Test',
                board: {
                  tiles: [
                    { id: 'tile-1', genre: 'House', status: 'empty' },
                    { id: 'tile-2', genre: 'Techno', status: 'empty' },
                  ],
                },
              },
            },
          }));
        }, [ctx.setGameState]);

        return (
          <div>
            <div data-testid="tile-1-status">
              {ctx.gameState.players['player-1']?.board.tiles[0]?.status ?? 'none'}
            </div>
            <div data-testid="tile-2-status">
              {ctx.gameState.players['player-1']?.board.tiles[1]?.status ?? 'none'}
            </div>
            <button
              data-testid="update-tile"
              onClick={() => ctx.updateTileStatus('player-1', 'tile-1', 'complete')}
            />
          </div>
        );
      }

      render(
        <GameProvider roomCode="ABCD">
          <TestComponent />
        </GameProvider>
      );

      expect(screen.getByTestId('tile-1-status').textContent).toBe('empty');
      expect(screen.getByTestId('tile-2-status').textContent).toBe('empty');

      act(() => {
        screen.getByTestId('update-tile').click();
      });

      expect(screen.getByTestId('tile-1-status').textContent).toBe('complete');
      // Other tile should be unchanged
      expect(screen.getByTestId('tile-2-status').textContent).toBe('empty');
    });

    it('setTileAudio updates audioUrl and sets status to complete', () => {
      function TestComponent() {
        const ctx = React.useContext(GameContext);
        if (!ctx) return null;

        React.useEffect(() => {
          ctx.setGameState(prev => ({
            ...prev,
            players: {
              'player-1': {
                id: 'player-1',
                name: 'Test',
                board: {
                  tiles: [
                    { id: 'tile-1', genre: 'House', status: 'pending' },
                  ],
                },
              },
            },
          }));
        }, [ctx.setGameState]);

        return (
          <div>
            <div data-testid="tile-status">
              {ctx.gameState.players['player-1']?.board.tiles[0]?.status ?? 'none'}
            </div>
            <div data-testid="tile-audio">
              {ctx.gameState.players['player-1']?.board.tiles[0]?.audioUrl ?? 'none'}
            </div>
            <button
              data-testid="set-audio"
              onClick={() => ctx.setTileAudio('player-1', 'tile-1', 'https://example.com/audio.mp3')}
            />
          </div>
        );
      }

      render(
        <GameProvider roomCode="ABCD">
          <TestComponent />
        </GameProvider>
      );

      expect(screen.getByTestId('tile-status').textContent).toBe('pending');
      expect(screen.getByTestId('tile-audio').textContent).toBe('none');

      act(() => {
        screen.getByTestId('set-audio').click();
      });

      expect(screen.getByTestId('tile-status').textContent).toBe('complete');
      expect(screen.getByTestId('tile-audio').textContent).toBe('https://example.com/audio.mp3');
    });

    it('toggleReady toggles isReady for a player', () => {
      function TestComponent() {
        const ctx = React.useContext(GameContext);
        if (!ctx) return null;

        React.useEffect(() => {
          ctx.setGameState(prev => ({
            ...prev,
            players: {
              'player-1': {
                id: 'player-1',
                name: 'Test',
                isReady: false,
                board: { tiles: [] },
              },
            },
          }));
        }, [ctx.setGameState]);

        return (
          <div>
            <div data-testid="is-ready">
              {String(ctx.gameState.players['player-1']?.isReady ?? 'none')}
            </div>
            <button
              data-testid="toggle"
              onClick={() => ctx.toggleReady('player-1')}
            />
          </div>
        );
      }

      render(
        <GameProvider roomCode="ABCD">
          <TestComponent />
        </GameProvider>
      );

      expect(screen.getByTestId('is-ready').textContent).toBe('false');

      act(() => {
        screen.getByTestId('toggle').click();
      });

      expect(screen.getByTestId('is-ready').textContent).toBe('true');

      act(() => {
        screen.getByTestId('toggle').click();
      });

      expect(screen.getByTestId('is-ready').textContent).toBe('false');
    });

    it('incrementScore adds points to player score', () => {
      function TestComponent() {
        const ctx = React.useContext(GameContext);
        if (!ctx) return null;

        React.useEffect(() => {
          ctx.setGameState(prev => ({
            ...prev,
            players: {
              'player-1': {
                id: 'player-1',
                name: 'Test',
                score: 10,
                board: { tiles: [] },
              },
            },
          }));
        }, [ctx.setGameState]);

        return (
          <div>
            <div data-testid="score">
              {String(ctx.gameState.players['player-1']?.score ?? 'none')}
            </div>
            <button
              data-testid="increment"
              onClick={() => ctx.incrementScore('player-1', 5)}
            />
          </div>
        );
      }

      render(
        <GameProvider roomCode="ABCD">
          <TestComponent />
        </GameProvider>
      );

      expect(screen.getByTestId('score').textContent).toBe('10');

      act(() => {
        screen.getByTestId('increment').click();
      });

      expect(screen.getByTestId('score').textContent).toBe('15');

      act(() => {
        screen.getByTestId('increment').click();
      });

      expect(screen.getByTestId('score').textContent).toBe('20');
    });

    it('incrementScore starts from 0 when player has no score', () => {
      function TestComponent() {
        const ctx = React.useContext(GameContext);
        if (!ctx) return null;

        React.useEffect(() => {
          ctx.setGameState(prev => ({
            ...prev,
            players: {
              'player-1': {
                id: 'player-1',
                name: 'Test',
                board: { tiles: [] },
              },
            },
          }));
        }, [ctx.setGameState]);

        return (
          <div>
            <div data-testid="score">
              {String(ctx.gameState.players['player-1']?.score ?? 'none')}
            </div>
            <button
              data-testid="increment"
              onClick={() => ctx.incrementScore('player-1', 3)}
            />
          </div>
        );
      }

      render(
        <GameProvider roomCode="ABCD">
          <TestComponent />
        </GameProvider>
      );

      expect(screen.getByTestId('score').textContent).toBe('none');

      act(() => {
        screen.getByTestId('increment').click();
      });

      expect(screen.getByTestId('score').textContent).toBe('3');
    });
  });

  describe('setGameState', () => {
    it('allows direct state updates via setGameState', () => {
      function TestComponent() {
        const ctx = React.useContext(GameContext);
        if (!ctx) return null;

        return (
          <div>
            <div data-testid="status">{ctx.gameState.status}</div>
            <div data-testid="round">{ctx.gameState.currentRound}</div>
            <button
              data-testid="update"
              onClick={() =>
                ctx.setGameState(prev => ({
                  ...prev,
                  status: 'playing',
                  currentRound: 3,
                }))
              }
            />
          </div>
        );
      }

      render(
        <GameProvider roomCode="ABCD">
          <TestComponent />
        </GameProvider>
      );

      expect(screen.getByTestId('status').textContent).toBe('lobby');
      expect(screen.getByTestId('round').textContent).toBe('0');

      act(() => {
        screen.getByTestId('update').click();
      });

      expect(screen.getByTestId('status').textContent).toBe('playing');
      expect(screen.getByTestId('round').textContent).toBe('3');
    });
  });

  describe('error state', () => {
    it('sets error when roomCode is empty', () => {
      render(
        <GameProvider>
          <LegacyContextReader />
        </GameProvider>
      );

      expect(screen.getByTestId('error').textContent).toBe(
        'Room code is required'
      );
      expect(screen.getByTestId('is-loading').textContent).toBe('false');
    });

    it('starts with no error when roomCode is provided', () => {
      render(
        <GameProvider roomCode="ABCD">
          <LegacyContextReader />
        </GameProvider>
      );

      // The fetch effect sets isLoading to true, but error starts as null
      expect(screen.getByTestId('error').textContent).toBe('none');
    });
  });
});

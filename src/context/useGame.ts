import { useContext, useEffect } from 'react';
import { GameContext, GameRefreshContext } from './GameContext';
import { gameSocket, GameSocketMessage } from '@/services/gameSocket';
import { useUser } from './UserContext';
import type { GameState } from '@/types/game';

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

export function useGameRefresh() {
  const context = useContext(GameRefreshContext);
  if (context === undefined) {
    throw new Error('useGameRefresh must be used within a GameRefreshProvider');
  }
  return context;
}

export function useGameRefreshEffect(callback: () => void) {
  const { forceRefresh } = useGameRefresh();

  useEffect(() => {
    callback();
  }, [forceRefresh, callback]);
}

// WebSocket connection hook for real-time game updates
export function useWebSocketConnection() {
  const { gameState, setGameState } = useGame();
  const { userSession } = useUser();

  useEffect(() => {
    if (!gameState.roomCode || !userSession.playerId || !userSession.playerSecret) {
      return;
    }

    const handleGameUpdate = (message: GameSocketMessage) => {
      if (message.type === 'game_state_update') {
        const newGameState = message.payload as Partial<GameState>;
        setGameState(prev => ({
          ...prev,
          ...newGameState,
          // Deep merge players object
          players: newGameState.players ? {
            ...prev.players,
            ...newGameState.players,
          } : prev.players,
        }));
      } else if (message.type === 'timer_tick') {
        setGameState(prev => ({
          ...prev,
          timeRemaining: message.payload.timeRemaining,
        }));
      } else if (message.type === 'turn_change') {
        // Round state updates are handled by game_state_update
        // This message type may not be needed for current implementation
      } else if (message.type === 'bingo_achievement') {
        setGameState(prev => ({
          ...prev,
          lastBingo: message.payload,
        }));
      }
    };

    gameSocket.connect({
      gameId: gameState.roomCode,
      playerId: userSession.playerId,
      playerSecret: userSession.playerSecret,
      onMessage: handleGameUpdate,
    });

    return () => {
      gameSocket.disconnect();
    };
  }, [gameState.roomCode, userSession.playerId, userSession.playerSecret, setGameState]);
}

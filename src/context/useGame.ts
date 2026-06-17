import { useContext, useEffect } from 'react';
import {
  GameContext,
  GameStateContext,
  GameTimerContext,
  GameActionsContext,
  GameRefreshContext,
} from './GameContext';

// Legacy combined hook — backward compatible with all existing consumers
export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

// Split hooks — components subscribe only to the slice they need

export function useGameState() {
  const context = useContext(GameStateContext);
  if (context === undefined) {
    throw new Error('useGameState must be used within a GameProvider');
  }
  return context;
}

export function useGameTimer() {
  const context = useContext(GameTimerContext);
  if (context === undefined) {
    throw new Error('useGameTimer must be used within a GameProvider');
  }
  return context;
}

export function useGameActions() {
  const context = useContext(GameActionsContext);
  if (context === undefined) {
    throw new Error('useGameActions must be used within a GameProvider');
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

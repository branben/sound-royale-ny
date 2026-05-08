import { useContext, useEffect } from 'react';
import { GameContext, GameRefreshContext } from './GameContext';

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

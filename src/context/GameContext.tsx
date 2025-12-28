import React, { createContext, useContext, useState, ReactNode } from 'react';
import { GameState, TileStatus } from '@/types/game';
import { mockGameState } from '@/data/mockGameState';

interface GameContextType {
  gameState: GameState;
  updateTileStatus: (playerId: string, tileId: string, status: TileStatus) => void;
  setTileAudio: (playerId: string, tileId: string, audioUrl: string) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(mockGameState);

  const updateTileStatus = (playerId: string, tileId: string, status: TileStatus) => {
    setGameState(prev => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          board: {
            ...prev.players[playerId].board,
            tiles: prev.players[playerId].board.tiles.map(tile =>
              tile.id === tileId ? { ...tile, status } : tile
            )
          }
        }
      }
    }));
  };

  const setTileAudio = (playerId: string, tileId: string, audioUrl: string) => {
    setGameState(prev => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          board: {
            ...prev.players[playerId].board,
            tiles: prev.players[playerId].board.tiles.map(tile =>
              tile.id === tileId ? { ...tile, audioUrl, status: 'complete' as TileStatus } : tile
            )
          }
        }
      }
    }));
  };

  return (
    <GameContext.Provider value={{ gameState, updateTileStatus, setTileAudio }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

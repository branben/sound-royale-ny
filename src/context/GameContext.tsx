import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GameState, TileStatus, RoomResponse } from '@/types/game';
import { mockGameState } from '@/data/mockGameState';
import { roomApi } from '@/services/api';

interface GameContextType {
  gameState: GameState;
  updateTileStatus: (playerId: string, tileId: string, status: TileStatus) => void;
  setTileAudio: (playerId: string, tileId: string, audioUrl: string) => void;
  isLoading: boolean;
  error: string | null;
  roomCode: string | null;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children, roomCode }: { children: ReactNode; roomCode?: string }) {
  const isE2E = import.meta.env.VITE_E2E_TESTING === 'true';
  const [gameState, setGameState] = useState<GameState>(mockGameState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch real data from backend when not in E2E mode and roomCode is provided
  useEffect(() => {
    if (isE2E || !roomCode) {
      return; // Use mock data in E2E mode or when no room code
    }

    const fetchRoomData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const roomData: RoomResponse = await roomApi.getRoom(roomCode);
        
        // Transform backend data to GameState format
        const players: GameState['players'] = {};
        roomData.players.forEach(player => {
          players[player.id] = {
            id: player.id,
            name: player.name,
            avatar: player.avatar,
            board: {
              tiles: player.tiles?.map(tile => ({
                id: tile.id,
                genre: tile.genre,
                status: tile.status,
                audioUrl: tile.audio_url,
              })) || []
            },
            playerSecret: player.player_secret,
            isConnected: player.is_connected,
            isSpectator: player.is_spectator,
          };
        });

        setGameState({
          roomCode: roomData.code,
          status: roomData.status,
          players,
          currentRound: roomData.current_round,
          winner: roomData.winner,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch room data');
        console.error('Error fetching room data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoomData();
  }, [roomCode, isE2E]);

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
    <GameContext.Provider value={{ gameState, updateTileStatus, setTileAudio, isLoading, error, roomCode: roomCode || null }}>
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

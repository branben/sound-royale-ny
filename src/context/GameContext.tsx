import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { GameState, TileStatus, RoomResponse, Player, Tile } from '@/types/game';
import { mockGameState } from '@/data/mockGameState';
import { roomApi } from '@/services/api';
import gameSocket, { GameSocketMessage, ConnectionStatus } from '@/services/gameSocket';

interface GameContextType {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  updateTileStatus: (playerId: string, tileId: string, status: TileStatus) => void;
  setTileAudio: (playerId: string, tileId: string, audioUrl: string) => void;
  toggleReady: (playerId: string) => void;
  incrementScore: (playerId: string, points: number) => void;
  isLoading: boolean;
  error: string | null;
  roomCode: string | null;
  timeRemaining: number | null;
  connectionStatus: ConnectionStatus;
}

export const GameContext = createContext<GameContextType | undefined>(undefined);

// Baseline state to keep UI stable before room data loads.
const emptyGameState: GameState = {
  gameId: '',
  roomCode: '',
  status: 'lobby',
  players: {},
  currentRound: 0,
};

export function GameProvider({ children, roomCode }: { children: ReactNode; roomCode?: string }) {
  const isE2E = import.meta.env.VITE_E2E_TESTING === 'true' || (typeof window !== 'undefined' && window.__E2E_TESTING__ === true);
  
  // Debug log for GameProvider initialization
  console.log('[GameContext] Provider initialized', { roomCode, isE2E });
  
  const [gameState, setGameState] = useState<GameState>(isE2E ? mockGameState : emptyGameState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  // Fetch real data from backend when not in E2E mode and roomCode is provided
  useEffect(() => {
    if (isE2E) {
      return; // Use mock data in E2E mode only
    }

    if (!roomCode) {
      setError('Room code is required');
      setIsLoading(false);
      setGameState(emptyGameState);
      return;
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
            isConnected: player.is_connected,
            isSpectator: player.is_spectator,
          };
        });

        setGameState({
          gameId: roomData.code,
          roomCode: roomData.code,
          status: roomData.status,
          players,
          currentRound: roomData.current_round,
          winner: typeof roomData.winner === 'string' ? roomData.winner : roomData.winner?.id,
          eloDeltas: roomData.elo_deltas?.map(d => ({
            playerId: d.player_id,
            playerName: d.player_name,
            previousElo: d.previous_elo,
            newElo: d.new_elo,
            delta: d.delta,
            isWinner: d.is_winner,
          })),
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

  // Real-time WebSocket connection for game state updates
  useEffect(() => {
    if (!roomCode) {
      return;
    }

    const playerId = localStorage.getItem('playerId') || undefined;
    const playerSecret = localStorage.getItem('playerSecret') || undefined;

    const handleMessage = (message: GameSocketMessage) => {
      switch (message.type) {
        case 'game_state_update': {
          const newState = message.payload;
          const players: GameState['players'] = {};
          if (newState.players) {
            Object.entries(newState.players).forEach(([id, playerData]: [string, unknown]) => {
              const player = playerData as Player;
              players[id] = {
                id,
                name: player.name,
                avatar: player.avatar,
                board: {
                  tiles: player.board?.tiles?.map((tile: Tile) => ({
                    id: tile.id,
                    genre: tile.genre,
                    status: tile.status,
                    audioUrl: tile.audioUrl,
                  })) || []
                },
                isConnected: player.isConnected,
                isSpectator: player.isSpectator,
                eloRating: player.eloRating,
                eloWins: player.eloWins,
                eloLosses: player.eloLosses,
                eloMatches: player.eloMatches,
              };
            });
          }
          setGameState({
            gameId: newState.gameId || roomCode,
            roomCode: newState.roomCode || roomCode,
            status: newState.status,
            players,
            currentRound: newState.currentRound,
            winner: newState.winner,
            roundState: newState.roundState,
            spectatorCount: newState.spectatorCount,
            eloDeltas: newState.eloDeltas,
          });
          break;
        }
        case 'bingo_achievement':
          console.log('[GameContext] Bingo achievement:', message.payload);
          break;
        case 'victory_celebration':
          console.log('[GameContext] Victory:', message.payload);
          break;
        case 'vote_submitted': {
          const { voterId, votedForId, votesRecorded } = message.payload;
          setGameState(prev => ({
            ...prev,
            roundState: prev.roundState
              ? {
                  ...prev.roundState,
                  votesRecorded,
                  votes: [
                    ...(prev.roundState.votes || []),
                    {
                      id: `${voterId}-${Date.now()}`,
                      voter: voterId,
                      voterName: prev.players[voterId]?.name || 'Unknown',
                      votedFor: votedForId,
                      votedForName: prev.players[votedForId]?.name || 'Unknown',
                    },
                  ],
                }
              : prev.roundState,
          }));
          break;
        }
        case 'timer_tick':
          setTimeRemaining(message.payload.timeRemaining);
          break;
        case 'turn_change': {
          const { round } = message.payload;
          setGameState(prev => ({
            ...prev,
            roundState: round,
            currentRound: round.roundNumber ?? prev.currentRound,
          }));
          break;
        }
        case 'player_joined': {
          const { playerId, playerName, isSpectator } = message.payload;
          setGameState(prev => ({
            ...prev,
            players: {
              ...prev.players,
              [playerId]: {
                id: playerId,
                name: playerName,
                isSpectator,
                board: { tiles: [] },
                isConnected: true,
              },
            },
          }));
          break;
        }
        case 'player_left': {
          const { playerId } = message.payload;
          setGameState(prev => ({
            ...prev,
            players: {
              ...prev.players,
              [playerId]: {
                ...prev.players[playerId],
                isConnected: false,
              },
            },
          }));
          break;
        }
      }
    };

    setConnectionStatus('connecting');
    gameSocket.connect({
      gameId: roomCode,
      playerId,
      playerSecret,
      onMessage: handleMessage,
      onConnect: () => {
        console.log('[GameContext] WebSocket connected');
        setConnectionStatus('connected');
      },
      onDisconnect: (reason) => {
        console.log('[GameContext] WebSocket disconnected:', reason);
        setConnectionStatus('disconnected');
      },
      onError: (error) => console.error('[GameContext] WebSocket error:', error),
    });

    return () => {
      gameSocket.disconnect();
    };
  }, [roomCode]);

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

  const toggleReady = (playerId: string) => {
    setGameState(prev => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          isReady: !prev.players[playerId]?.isReady
        }
      }
    }));
  };

  // PR ERROR 2: Direct state mutation - anti-pattern from Gas Town #660
  const incrementScore = (playerId: string, points: number) => {
    setGameState(prev => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          score: (prev.players[playerId]?.score || 0) + points
        }
      }
    }));
  };

  return (
    <GameContext.Provider value={{ gameState, setGameState, updateTileStatus, setTileAudio, toggleReady, incrementScore, isLoading, error, roomCode: roomCode || null, timeRemaining, connectionStatus }}>
      {children}
    </GameContext.Provider>
  );
}

// Refresh context for forcing game state updates
export const GameRefreshContext = createContext<{
  forceRefresh: number;
  setForceRefresh: (timestamp: number) => void;
} | undefined>(undefined);

export function GameRefreshProvider({ children }: { children: ReactNode }) {
  const [forceRefresh, setForceRefresh] = useState<number>(Date.now());
  
  return (
    <GameRefreshContext.Provider value={{ forceRefresh, setForceRefresh }}>
      {children}
    </GameRefreshContext.Provider>
  );
}

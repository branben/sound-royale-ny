import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { GameState, TileStatus, RoomResponse, Tile } from '@/types/game';
import { mockGameState } from '@/data/mockGameState';
import { normalizeRoomWinner, roomApi, getStoredAccessToken } from '@/services/api';
import gameSocket, { GameSocketMessage } from '@/services/gameSocket';
import { ReconnectingBanner } from '@/components/game/ReconnectingBanner';
import { useUser } from './UserContext';

// ---------------------------------------------------------------------------
// State context — game state, players, status, rounds, winner
// ---------------------------------------------------------------------------

interface GameStateContextType {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  isLoading: boolean;
  error: string | null;
  roomCode: string | null;
  isReconnecting: boolean;
}

export const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Timer context — timeRemaining (updated every second via timer_tick)
// ---------------------------------------------------------------------------

interface GameTimerContextType {
  timeRemaining: number | null;
}

export const GameTimerContext = createContext<GameTimerContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Actions context — stable callbacks for mutating game state
// ---------------------------------------------------------------------------

interface GameActionsContextType {
  updateTileStatus: (playerId: string, tileId: string, status: TileStatus) => void;
  setTileAudio: (playerId: string, tileId: string, audioUrl: string) => void;
  toggleReady: (playerId: string) => void;
  incrementScore: (playerId: string, points: number) => void;
}

export const GameActionsContext = createContext<GameActionsContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Legacy combined context — kept for backward compatibility
// ---------------------------------------------------------------------------

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
  isReconnecting: boolean;
}

export const GameContext = createContext<GameContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Baseline state
// ---------------------------------------------------------------------------

const emptyGameState: GameState = {
  gameId: '',
  roomCode: '',
  status: 'lobby',
  players: {},
  currentRound: 0,
};

// Build a complete GameState from a RoomResponse. This REPLACES the previous
// state rather than merging — used when re-fetching after a socket reconnect
// so the UI reflects the authoritative server state without stale leftovers.
function buildGameStateFromRoom(roomData: RoomResponse): GameState {
  const players: GameState['players'] = {};
  roomData.players.forEach((player) => {
    const tiles =
      player.board?.tiles ??
      player.tiles?.map((tile) => ({
        id: tile.id,
        genre: tile.genre,
        status: tile.status,
        audioUrl: tile.audio_url,
      })) ??
      [];

    players[player.id] = {
      id: player.id,
      name: player.name ?? '',
      avatar: player.avatar,
      isDiscordVerified: player.is_discord_verified,
      discordUsername: player.discord_username,
      discordAvatarUrl: player.discord_avatar_url,
      board: { tiles },
      isConnected: player.is_connected,
      isSpectator: player.is_spectator,
      isHost: player.is_host,
      isReady: player.is_ready,
      eloRating: player.elo_rating,
      eloWins: player.elo_wins,
      eloLosses: player.elo_losses,
      eloMatches: player.elo_matches,
      isCheckedIn: player.is_checked_in,
      currentTitle: player.current_title,
      scoreInfo: player.scoreInfo,
    };
  });

  return {
    gameId: roomData.code,
    roomCode: roomData.code,
    status: roomData.status,
    players,
    currentRound: roomData.current_round,
    winner: normalizeRoomWinner(roomData.winner),
    eloDeltas: roomData.elo_deltas?.map((d) => ({
      playerId: d.player_id,
      playerName: d.player_name,
      previousElo: d.previous_elo,
      newElo: d.new_elo,
      delta: d.delta,
      isWinner: d.is_winner,
    })),
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GameProvider({ children, roomCode }: { children: ReactNode; roomCode?: string }) {
  const isE2E =
    import.meta.env.VITE_E2E_TESTING === 'true' ||
    (typeof window !== 'undefined' && window.__E2E_TESTING__ === true);
  const { userSession } = useUser();

  const [gameState, setGameState] = useState<GameState>(isE2E ? mockGameState : emptyGameState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const isMounted = useRef(true);

  // Map a backend RoomResponse into the normalized client GameState.
  // Used both on initial mount and on WebSocket reconnect so that the
  // full game state is REPLACED (not merged) after a disconnect, per guardrail #101.
  const mapRoomToGameState = useCallback((roomData: RoomResponse): GameState => {
    const players: GameState['players'] = {};
    roomData.players.forEach((player) => {
      const tiles =
        player.board?.tiles ??
        player.tiles?.map((tile) => ({
          id: tile.id,
          genre: tile.genre,
          status: tile.status,
          audioUrl: tile.audio_url,
        })) ??
        [];

      players[player.id] = {
        id: player.id,
        name: player.name ?? '',
        avatar: player.avatar,
        isDiscordVerified: player.is_discord_verified,
        discordUsername: player.discord_username,
        discordAvatarUrl: player.discord_avatar_url,
        board: { tiles },
        isConnected: player.is_connected,
        isSpectator: player.is_spectator,
        isHost: player.is_host,
        isReady: player.is_ready,
        eloRating: player.elo_rating,
        eloWins: player.elo_wins,
        eloLosses: player.elo_losses,
        eloMatches: player.elo_matches,
        isCheckedIn: player.is_checked_in,
        currentTitle: player.current_title,
        scoreInfo: player.scoreInfo,
      };
    });

    return {
      gameId: roomData.code,
      roomCode: roomData.code,
      status: roomData.status,
      players,
      currentRound: roomData.current_round,
      winner: normalizeRoomWinner(roomData.winner),
      eloDeltas: roomData.elo_deltas?.map((d) => ({
        playerId: d.player_id,
        playerName: d.player_name,
        previousElo: d.previous_elo,
        newElo: d.new_elo,
        delta: d.delta,
        isWinner: d.is_winner,
      })),
    };
  }, []);

  // Fetch real data from backend when not in E2E mode and roomCode is provided
  useEffect(() => {
    isMounted.current = true;
    if (isE2E) {
      return;
    }

    if (!roomCode) {
      setError('Room code is required');
      setIsLoading(false);
      setGameState(() => emptyGameState);
      return;
    }

    const fetchRoomData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const roomData: RoomResponse = await roomApi.getRoom(roomCode);

        if (isMounted.current) {
          setGameState(buildGameStateFromRoom(roomData));
        }
      } catch (err) {
        if (isMounted.current)
          setError(err instanceof Error ? err.message : 'Failed to fetch room data');
        console.error('Error fetching room data:', err);
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    };

    fetchRoomData();

    return () => {
      isMounted.current = false;
    };
  }, [roomCode, isE2E, mapRoomToGameState]);

  useEffect(() => {
    if (isE2E || !roomCode) {
      return;
    }

    const handleMessage = (message: GameSocketMessage) => {
      switch (message.type) {
        case 'game_state_update': {
          const newState = message.payload;
          const players: GameState['players'] = {};
          if (newState.players) {
            const seen = new Set<string>();
            Object.entries(newState.players).forEach(
              ([id, playerData]: [string, GameState['players'][string]]) => {
                if (!playerData || seen.has(id)) return;
                seen.add(id);
                const player = playerData;
                players[id] = {
                  id,
                  name: player.name ?? '',
                  avatar: player.avatar,
                  isDiscordVerified: player.isDiscordVerified,
                  discordUsername: player.discordUsername,
                  discordAvatarUrl: player.discordAvatarUrl,
                  board: {
                    tiles:
                      player.board?.tiles?.map((tile: Tile) => ({
                        id: tile.id,
                        genre: tile.genre,
                        status: tile.status,
                        audioUrl: tile.audioUrl,
                      })) || [],
                  },
                  isConnected: player.isConnected,
                  isSpectator: player.isSpectator,
                  isHost: player.isHost,
                  isReady: player.isReady,
                  eloRating: player.eloRating,
                  eloWins: player.eloWins,
                  eloLosses: player.eloLosses,
                  eloMatches: player.eloMatches,
                  isCheckedIn: player.isCheckedIn,
                  currentTitle: player.currentTitle,
                  scoreInfo: player.scoreInfo,
                };
              },
            );
          }
          setGameState((prev) => ({
            ...prev,
            gameId: newState.gameId || roomCode,
            roomCode: newState.roomCode || roomCode,
            status: newState.status,
            matchType: newState.matchType,
            players,
            currentRound: newState.currentRound,
            winner: newState.winner,
            roundState: newState.roundState,
            spectatorCount: newState.spectatorCount,
            eloDeltas: newState.eloDeltas,
          }));
          break;
        }
        case 'bingo_achievement':
        case 'victory_celebration':
        case 'vote_submitted':
          break;
        case 'timer_tick':
          setTimeRemaining(message.payload.timeRemaining);
          break;
        case 'error':
          if (isMounted.current) {
            setError(message.payload.message);
          }
          break;
        case 'turn_change':
        case 'player_joined':
        case 'player_left':
          break;
        case 'host_migrated': {
          const { newHostId } = message.payload;
          setGameState((prev) => {
            const updatedPlayers: GameState['players'] = {};
            for (const [id, player] of Object.entries(prev.players)) {
              updatedPlayers[id] = { ...player, isHost: id === newHostId };
            }
            return { ...prev, players: updatedPlayers };
          });
          break;
        }
      }
    };

    const refreshRoomState = async () => {
      if (!roomCode) return;
      try {
        const roomData: RoomResponse = await roomApi.getRoom(roomCode);
        if (isMounted.current) {
          // REPLACE (not merge) so a reconnect reflects authoritative state.
          setGameState(buildGameStateFromRoom(roomData));
        }
      } catch (err) {
        console.error('[GameContext] Failed to refresh room state:', err);
      }
    };

    gameSocket.connect({
      gameId: roomCode,
      playerId: userSession.playerId ?? undefined,
      playerSecret: userSession.playerSecret ?? undefined,
      accessToken: getStoredAccessToken(),
      onMessage: handleMessage,
      onConnect: async () => {
        // On (re)connect, re-fetch full game state from the backend and REPLACE
        // the local state so we recover from any state lost during the outage.
        await refreshRoomState();
        if (isMounted.current) setIsReconnecting(false);
      },
      onDisconnect: () => {
        // Show the reconnecting banner during the disconnect→reconnect window.
        if (isMounted.current) setIsReconnecting(true);
      },
      onError: (error) => console.error('[GameContext] WebSocket error:', error),
    });

    return () => {
      gameSocket.disconnect();
    };
  }, [roomCode, isE2E, userSession.playerId, userSession.playerSecret]);

  const updateTileStatus = useCallback((playerId: string, tileId: string, status: TileStatus) => {
    setGameState((prev) => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          board: {
            ...prev.players[playerId].board,
            tiles: prev.players[playerId].board.tiles.map((tile) =>
              tile.id === tileId ? { ...tile, status } : tile,
            ),
          },
        },
      },
    }));
  }, []);

  const setTileAudio = useCallback((playerId: string, tileId: string, audioUrl: string) => {
    setGameState((prev) => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          board: {
            ...prev.players[playerId].board,
            tiles: prev.players[playerId].board.tiles.map((tile) =>
              tile.id === tileId ? { ...tile, audioUrl, status: 'complete' as TileStatus } : tile,
            ),
          },
        },
      },
    }));
  }, []);

  const toggleReady = useCallback((playerId: string) => {
    setGameState((prev) => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          isReady: !prev.players[playerId]?.isReady,
        },
      },
    }));
  }, []);

  const incrementScore = useCallback((playerId: string, points: number) => {
    setGameState((prev) => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          score: (prev.players[playerId]?.score || 0) + points,
        },
      },
    }));
  }, []);

  // Split context values — each memoized independently so consumers only
  // re-render when the slice they depend on changes.
  const stateValue = useMemo(
    () => ({
      gameState,
      setGameState,
      isLoading,
      error,
      roomCode: roomCode || null,
      isReconnecting,
    }),
    [gameState, setGameState, isLoading, error, roomCode, isReconnecting],
  );

  const timerValue = useMemo(
    () => ({
      timeRemaining,
    }),
    [timeRemaining],
  );

  const actionsValue = useMemo(
    () => ({
      updateTileStatus,
      setTileAudio,
      toggleReady,
      incrementScore,
    }),
    [updateTileStatus, setTileAudio, toggleReady, incrementScore],
  );

  // Legacy combined value — for existing consumers that use useGame()
  const legacyValue = useMemo(
    () => ({
      gameState,
      setGameState,
      updateTileStatus,
      setTileAudio,
      toggleReady,
      incrementScore,
      isLoading,
      error,
      roomCode: roomCode || null,
      timeRemaining,
      isReconnecting,
    }),
    [
      gameState,
      setGameState,
      updateTileStatus,
      setTileAudio,
      toggleReady,
      incrementScore,
      isLoading,
      error,
      roomCode,
      timeRemaining,
      isReconnecting,
    ],
  );

  return (
    <GameStateContext.Provider value={stateValue}>
      <GameTimerContext.Provider value={timerValue}>
        <GameActionsContext.Provider value={actionsValue}>
          <GameContext.Provider value={legacyValue}>
            {children}
            <ReconnectingBanner isVisible={isReconnecting} />
          </GameContext.Provider>
        </GameActionsContext.Provider>
      </GameTimerContext.Provider>
    </GameStateContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Refresh context — unchanged
// ---------------------------------------------------------------------------

export const GameRefreshContext = createContext<
  | {
      forceRefresh: number;
      setForceRefresh: (timestamp: number) => void;
    }
  | undefined
>(undefined);

export function GameRefreshProvider({ children }: { children: ReactNode }) {
  const [forceRefresh, setForceRefresh] = useState<number>(Date.now());

  return (
    <GameRefreshContext.Provider value={{ forceRefresh, setForceRefresh }}>
      {children}
    </GameRefreshContext.Provider>
  );
}

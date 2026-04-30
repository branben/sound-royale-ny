import axios from 'axios';
import { Player, Tile, RoomResponse, CreateRoomResponse } from '@/types/game';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

export interface VerifiedUser {
  id: string;
  display_name: string;
  email: string;
  email_verified_at: string | null;
  elo_rating: number;
  elo_wins: number;
  elo_losses: number;
  elo_matches: number;
}

export interface LeaderboardUser {
  id: string;
  display_name: string;
  elo_rating: number;
  elo_wins: number;
  elo_losses: number;
  elo_matches: number;
}

export const authApi = {
  requestCode: async (email: string): Promise<{ status: string }> => {
    const response = await api.post('/auth/request-code/', { email });
    return response.data;
  },

  verifyCode: async (
    email: string,
    code: string,
    displayName?: string
  ): Promise<VerifiedUser> => {
    const response = await api.post('/auth/verify-code/', {
      email,
      code,
      display_name: displayName,
    });
    return response.data;
  },

  me: async (): Promise<{ user: VerifiedUser | null }> => {
    const response = await api.get('/auth/me/');
    return response.data;
  },

  logout: async (): Promise<{ status: string }> => {
    const response = await api.post('/auth/logout/');
    return response.data;
  },
};

export const leaderboardApi = {
  global: async (): Promise<{ leaderboard: LeaderboardUser[] }> => {
    const response = await api.get('/leaderboard/');
    return response.data;
  },
};

export const roomApi = {
  getRooms: async (): Promise<RoomResponse[]> => {
    const response = await api.get('/rooms/');
    return response.data;
  },

  getRoom: async (roomId: string): Promise<RoomResponse> => {
    const response = await api.get(`/rooms/${roomId}/`);
    return response.data;
  },

  createRoom: async (roomName: string, playerName: string, totalRounds?: number, theme?: string, customGenres?: string[]): Promise<CreateRoomResponse> => {
    const response = await api.post('/rooms/', {
      name: roomName,
      player_name: playerName,
      total_rounds: totalRounds,
      theme: theme,
      custom_genres: customGenres,
    });
    return response.data;
  },

  // PR ERROR 3: Missing error handler - no try/catch on async call
  getRoomStats: async (roomId: string): Promise<any> => {
    try {
      const response = await api.get(`/rooms/${roomId}/stats/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch stats for room ${roomId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  },
};

export const gameApi = {
  getGameState: async (roomId: string): Promise<any> => {
    const response = await api.get(`/rooms/${roomId}/game_state/`);
    return response.data;
  },

  joinRoom: async (roomId: string, playerName: string, isSpectator?: boolean): Promise<Player> => {
    const response = await api.post(`/rooms/${roomId}/join_game/`, {
      player_name: playerName,
      is_spectator: isSpectator || false,
    });
    const data = response.data;
    // Backend returns room data with player_id and player_secret at top level
    // Use player_id to find player (backend auto-assigns spectator names)
    const playerData = data.players?.find((p: any) => p.id === data.player_id);
    if (!playerData) {
      throw new Error('Player not found in join response');
    }
    return transformPlayer({
      ...playerData,
      player_secret: data.player_secret,
    });
  },

  rejoinRoom: async (roomId: string, playerSecret: string): Promise<Player | null> => {
    try {
      const response = await api.post(`/rooms/${roomId}/rejoin_game/`, {
        player_secret: playerSecret,
      });
      return transformPlayer(response.data);
    } catch {
      return null;
    }
  },

  startGame: async (roomId: string): Promise<{ status: string }> => {
    const response = await api.post(`/rooms/${roomId}/start_game/`);
    return response.data;
  },

  submitTile: async (tileId: string, audioFile: File, playerSecret: string): Promise<any> => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('player_secret', playerSecret);

    const response = await api.post(`/tiles/${tileId}/play_tile/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  toggleReady: async (roomId: string, playerSecret: string): Promise<{ is_ready: boolean }> => {
    const response = await api.post(`/rooms/${roomId}/toggle_ready/`, {
      player_secret: playerSecret,
    });
    return response.data;
  },

  resetGame: async (roomId: string, playerSecret: string): Promise<any> => {
    const response = await api.post(`/rooms/${roomId}/reset_game/`, {
      player_secret: playerSecret,
    });
    return response.data;
  },

  kickPlayer: async (roomId: string, playerId: string, playerSecret: string): Promise<any> => {
    const response = await api.post(`/rooms/${roomId}/kick_player/`, {
      player_id: playerId,
      player_secret: playerSecret,
    });
    return response.data;
  },

  castVote: async (roomId: string, playerSecret: string, votedForPlayerId: string): Promise<any> => {
    const response = await api.post(`/rooms/${roomId}/vote/`, {
      player_secret: playerSecret,
      voted_for_player_id: votedForPlayerId,
    });
    return response.data;
  },

  nextTurn: async (roomId: string, playerSecret: string): Promise<any> => {
    const response = await api.post(`/rooms/${roomId}/next_turn/`, {
      player_secret: playerSecret,
    });
    return response.data;
  },

  openVoting: async (roomId: string, playerSecret: string): Promise<any> => {
    const response = await api.post(`/rooms/${roomId}/open_voting/`, {
      player_secret: playerSecret,
    });
    return response.data;
  },
};

function transformPlayer(backendPlayer: RoomResponse['players'][0]): Player {
  return {
    id: backendPlayer.id,
    name: backendPlayer.name,
    avatar: backendPlayer.avatar,
    board: {
      tiles: backendPlayer.tiles || []
    },
    playerSecret: backendPlayer.player_secret,
    verifiedUserId: backendPlayer.verifiedUserId ?? backendPlayer.verified_user,
    isVerified: backendPlayer.isVerified ?? Boolean(backendPlayer.verified_user),
    isConnected: backendPlayer.is_connected,
    isSpectator: backendPlayer.is_spectator,
    isHost: backendPlayer.is_host,
    eloRating: backendPlayer.elo_rating,
    eloWins: backendPlayer.elo_wins,
    eloLosses: backendPlayer.elo_losses,
    eloMatches: backendPlayer.elo_matches,
  };
}

export default api;

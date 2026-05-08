import axios from 'axios';
import { Player, Tile, RoomResponse, CreateRoomResponse, ThemeRotation, GenrePerformance } from '@/types/game';
import { DiscordLinkResponse, DiscordSession } from '@/services/discordSession';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
});

interface PlayerResponse {
  id: string;
  name?: string;
  player_name?: string;
  avatar?: string;
  is_discord_verified?: boolean;
  isDiscordVerified?: boolean;
  discord_username?: string;
  discordUsername?: string;
  discord_avatar_url?: string;
  discordAvatarUrl?: string;
  board?: Player['board'];
  tiles?: Tile[];
  player_secret?: string;
  is_connected?: boolean;
  isConnected?: boolean;
  is_spectator?: boolean;
  isSpectator?: boolean;
  is_host?: boolean;
  isHost?: boolean;
  is_ready?: boolean;
  isReady?: boolean;
  elo_rating?: number;
  eloRating?: number;
  elo_wins?: number;
  eloWins?: number;
  elo_losses?: number;
  eloLosses?: number;
  elo_matches?: number;
  eloMatches?: number;
  is_checked_in?: boolean;
  isCheckedIn?: boolean;
  current_title?: Player['currentTitle'];
  currentTitle?: Player['currentTitle'];
  scoreInfo?: Player['scoreInfo'];
}

function discordSessionPayload(discordSession?: DiscordSession): {
  discord_user_id?: string;
  discord_session_secret?: string;
} {
  if (!discordSession) return {};
  return {
    discord_user_id: discordSession.discordUserId,
    discord_session_secret: discordSession.sessionSecret,
  };
}

export const roomApi = {
  getRooms: async (): Promise<RoomResponse[]> => {
    const response = await api.get('/rooms/');
    return response.data;
  },

  getRoom: async (roomId: string): Promise<RoomResponse> => {
    const response = await api.get(`/rooms/${roomId}/`);
    return response.data;
  },

  createRoom: async (
    roomName: string,
    playerName: string,
    totalRounds?: number,
    theme?: string,
    customGenres?: string[],
    discordSession?: DiscordSession
  ): Promise<CreateRoomResponse> => {
    const response = await api.post('/rooms/', {
      name: roomName,
      player_name: playerName,
      total_rounds: totalRounds,
      theme: theme,
      custom_genres: customGenres,
      ...discordSessionPayload(discordSession),
    });
    return response.data;
  },

  getThemeRotations: async (): Promise<ThemeRotation[]> => {
    const response = await api.get('/theme-rotations/');
    return response.data;
  },

  updateThemeRotation: async (
    key: ThemeRotation['key'],
    rotation: Pick<ThemeRotation, 'name' | 'description' | 'genres'>,
    adminSecret: string
  ): Promise<ThemeRotation> => {
    const response = await api.put(`/theme-rotations/${key}/`, rotation, {
      headers: {
        'X-Theme-Admin-Secret': adminSecret,
      },
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

  joinRoom: async (
    roomId: string,
    playerName: string,
    isSpectator?: boolean,
    discordSession?: DiscordSession
  ): Promise<Player> => {
    const response = await api.post(`/rooms/${roomId}/join_game/`, {
      player_name: playerName,
      is_spectator: isSpectator || false,
      ...discordSessionPayload(discordSession),
    });
    return transformPlayer(response.data);
  },

  rejoinRoom: async (roomId: string, playerSecret: string): Promise<Player | null> => {
    try {
      const response = await api.post(`/rooms/${roomId}/rejoin_game/`, {
        player_secret: playerSecret,
      });
      return {
        ...transformPlayer(response.data),
        playerSecret,
      };
    } catch {
      return null;
    }
  },

  startGame: async (roomId: string, playerSecret: string): Promise<{ status: string }> => {
    const response = await api.post(`/rooms/${roomId}/start_game/`, { player_secret: playerSecret });
    return response.data;
  },

  submitTile: async (tileId: string, audioFile: File, playerId: string): Promise<any> => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('player_id', playerId);

    const response = await api.post(`/tiles/${tileId}/play_tile/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
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

  toggleReady: async (roomId: string, playerId: string, playerSecret: string): Promise<{ player_id: string; is_ready: boolean }> => {
    const response = await api.post(`/rooms/${roomId}/toggle_ready/`, {
      player_id: playerId,
      player_secret: playerSecret,
    });
    return response.data;
  },

  getGenrePerformance: async (playerId: string): Promise<GenrePerformance[]> => {
    const response = await api.get(`/players/by-id/${playerId}/genre_performance/`);
    return response.data;
  },

  getAllPlayers: async (): Promise<Player[]> => {
    const response = await api.get('/players/');
    return response.data.map((p: PlayerResponse) => transformPlayer(p));
  },

  setCheckedIn: async (playerId: string, isCheckedIn: boolean, adminSecret: string): Promise<Player> => {
    const response = await api.post(`/players/by-id/${playerId}/set_checked_in/`, {
      is_checked_in: isCheckedIn,
    }, {
      headers: {
        'X-Theme-Admin-Secret': adminSecret,
      },
    });
    return transformPlayer(response.data);
  },
};

export const discordApi = {
  // Initiate Discord OAuth flow
  getAuthUrl: async (): Promise<{ authorization_url: string; state: string }> => {
    const response = await api.get('/auth/discord/');
    return response.data;
  },

  // Handle Discord OAuth callback
  handleCallback: async (code: string, state: string): Promise<{
    discord_user_id: string;
    discord_username: string;
    discriminator: string;
    avatar: string;
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }> => {
    const response = await api.get(`/auth/discord/callback/?code=${code}&state=${state}`);
    return response.data;
  },

  // Link Discord account to player
  linkAccount: async (playerId: string, playerSecret: string, discordData: {
    discord_user_id: string;
    discord_username: string;
    discord_avatar_url?: string;
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }): Promise<DiscordLinkResponse & { status: string }> => {
    const response = await api.post('/auth/discord/link/', {
      player_id: playerId,
      player_secret: playerSecret,
      ...discordData,
    });
    return response.data;
  },

  // Unlink Discord account
  unlinkAccount: async (playerId: string, playerSecret: string): Promise<{ status: string }> => {
    const response = await api.post('/auth/discord/unlink/', {
      player_id: playerId,
      player_secret: playerSecret,
    });
    return response.data;
  },

  // Get Discord account status
  getAccountStatus: async (playerId: string, playerSecret: string): Promise<{
    is_linked: boolean;
    discord_user_id?: string;
    discord_username?: string;
    discord_avatar_url?: string;
    discord_session_secret?: string;
    linked_at?: string;
    last_sync_at?: string;
    privacy_settings?: Record<string, any>;
  }> => {
    const response = await api.get(`/auth/discord/status/?player_id=${playerId}&player_secret=${playerSecret}`);
    return response.data;
  },

  getAccountStatusBySession: async (discordUserId: string, sessionSecret: string): Promise<{
    is_linked: boolean;
    discord_user_id?: string;
    discord_username?: string;
    discord_avatar_url?: string;
    discord_session_secret?: string;
    linked_at?: string;
    last_sync_at?: string;
    privacy_settings?: Record<string, any>;
  }> => {
    const response = await api.get(`/auth/discord/status/?discord_user_id=${discordUserId}&discord_session_secret=${sessionSecret}`);
    return response.data;
  },
};

function transformPlayer(backendPlayer: PlayerResponse): Player {
  return {
    id: backendPlayer.id,
    name: backendPlayer.name ?? backendPlayer.player_name ?? '',
    avatar: backendPlayer.avatar,
    isDiscordVerified: backendPlayer.is_discord_verified ?? backendPlayer.isDiscordVerified,
    discordUsername: backendPlayer.discord_username ?? backendPlayer.discordUsername,
    discordAvatarUrl: backendPlayer.discord_avatar_url ?? backendPlayer.discordAvatarUrl,
    board: backendPlayer.board ?? {
      tiles: backendPlayer.tiles || [],
    },
    playerSecret: backendPlayer.player_secret,
    isConnected: backendPlayer.is_connected ?? backendPlayer.isConnected,
    isSpectator: backendPlayer.is_spectator ?? backendPlayer.isSpectator,
    isHost: backendPlayer.is_host ?? backendPlayer.isHost,
    isReady: backendPlayer.is_ready ?? backendPlayer.isReady,
    eloRating: backendPlayer.elo_rating ?? backendPlayer.eloRating,
    eloWins: backendPlayer.elo_wins ?? backendPlayer.eloWins,
    eloLosses: backendPlayer.elo_losses ?? backendPlayer.eloLosses,
    eloMatches: backendPlayer.elo_matches ?? backendPlayer.eloMatches,
    isCheckedIn: backendPlayer.is_checked_in ?? backendPlayer.isCheckedIn,
    currentTitle: backendPlayer.current_title ?? backendPlayer.currentTitle,
    scoreInfo: backendPlayer.scoreInfo,
  };
}

export function normalizeRoomWinner(winner: RoomResponse['winner']): string | undefined {
  if (!winner) {
    return undefined;
  }

  return typeof winner === 'string' ? winner : winner.id;
}

export default api;

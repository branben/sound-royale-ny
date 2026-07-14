import axios from 'axios';
import {
  Player,
  RoomResponse,
  CreateRoomResponse,
  JoinedPlayerResponse,
  ThemeRotation,
  GenrePerformance,
  BackendPlayer,
  GameState,
} from '@/types/game';
import { DiscordLinkResponse, DiscordSession } from '@/services/discordSession';
import { toast } from '@/hooks/use-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// ── User-facing error surfacing ────────────────────────────────────────
// Central place so every failed API call raises a visible toast instead of
// failing silently. The shadcn <Toaster /> is mounted once in App.tsx.
function notifyApiError(title: string, description?: string): void {
  toast({
    variant: 'destructive',
    title,
    description,
  });
}

// ── Token storage helpers ──────────────────────────────────────────────
const ACCESS_TOKEN_KEY = 'soundRoyaleAccessToken';
const REFRESH_TOKEN_KEY = 'soundRoyaleRefreshToken';

export function getStoredAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch (error) {
    // Storage can throw in private-mode / disabled-storage contexts. This runs
    // on every request, so we log only (toasting here would storm the UI).
    console.error('Failed to read access token from storage:', error);
    return null;
  }
}

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to read refresh token from storage:', error);
    return null;
  }
}

export function storeTokens(access: string, refresh: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  } catch (error) {
    console.warn('Failed to store tokens:', error);
  }
}

export function clearStoredTokens(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.warn('Failed to clear tokens:', error);
  }
}

// ── Axios instance ─────────────────────────────────────────────────────
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
});

// Request interceptor: attach JWT Authorization header
api.interceptors.request.use(
  (config) => {
    const token = getStoredAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Track pending refresh to avoid duplicate refresh calls
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token ?? '');
    }
  });
  failedQueue = [];
}

// Response interceptor: handle 401 with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};

    // Auto-log 4xx/5xx API errors to the backend error log
    if (!config.__skipErrorLog) {
      try {
        await api
          .post('/errors/log/', {
            path: config.url || '',
            method: (config.method || '').toUpperCase(),
            status: error.response?.status || 0,
            message: error.response?.data?.error || error.message || 'Unknown error',
            stack: error.stack || '',
          })
          .catch((err) => console.error('Failed to log error:', err));
      } catch (e) {
        void e; // non-fatal error-log failure
      }
    }

    // Global user-facing surfacing of unexpected failures. We toast on 5xx and
    // network/timeout errors (infrastructure problems the user can't fix
    // themselves). 4xx are "expected" client errors and are surfaced by the
    // specific call site with a contextual message, so we don't double-toast.
    // 401 is handled by the refresh flow below and is skipped.
    const status = error.response?.status;
    const isNetworkError = !error.response;
    if (
      !config.__skipErrorLog &&
      config.url !== '/errors/log/' &&
      status !== 401 &&
      (isNetworkError || (typeof status === 'number' && status >= 500))
    ) {
      const message =
        (error.response?.data && (error.response.data.error as string)) ||
        error.message ||
        'Unexpected server error';
      notifyApiError('Something went wrong', message);
    }

    // Handle 401: attempt token refresh
    if (status === 401 && !config.__isRetry && !config.__skipErrorLog) {
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) {
        clearStoredTokens();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              config.headers.Authorization = `Bearer ${token}`;
              config.__isRetry = true;
              resolve(api(config));
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      config.__isRetry = true;

      try {
        const response = await axios.post(`${API_BASE_URL}/token/refresh/`, {
          refresh: refreshToken,
        });
        const newAccess = response.data.access;
        const newRefresh = response.data.refresh;
        storeTokens(newAccess, newRefresh);
        config.headers.Authorization = `Bearer ${newAccess}`;
        processQueue(null, newAccess);
        return api(config);
      } catch (refreshError) {
        clearStoredTokens();
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

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
    discordSession?: DiscordSession,
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
    adminSecret: string,
  ): Promise<ThemeRotation> => {
    const response = await api.put(`/theme-rotations/${key}/`, rotation, {
      headers: {
        'X-Theme-Admin-Secret': adminSecret,
      },
    });
    return response.data;
  },

  verifyAdminPin: async (pin: string): Promise<{ valid: boolean }> => {
    const response = await axios.post(`${API_BASE_URL}/admin/verify/`, { pin });
    return response.data;
  },

  // PR ERROR 3: was missing any error handler — a failed stats fetch silently
  // returned undefined and swallowed the failure. Now it logs and re-throws;
  // the global response interceptor surfaces a toast for 5xx/network failures.
  getRoomStats: async (roomId: string): Promise<Record<string, unknown>> => {
    try {
      const response = await api.get(`/rooms/${roomId}/stats/`);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to fetch stats for room ${roomId}:`, message);
      throw error;
    }
  },
};

export const gameApi = {
  getGameState: async (roomId: string): Promise<GameState> => {
    const response = await api.get(`/rooms/${roomId}/game_state/`);
    return response.data;
  },

  joinRoom: async (
    roomId: string,
    playerName: string,
    isSpectator?: boolean,
    discordSession?: DiscordSession,
  ): Promise<JoinedPlayerResponse> => {
    const response = await api.post(`/rooms/${roomId}/join_game/`, {
      name: playerName,
      is_spectator: isSpectator || false,
      ...discordSessionPayload(discordSession),
    });
    return {
      ...transformPlayer(response.data),
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
    };
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
    } catch (error) {
      // Rejoin failure is user-visible: it means the player can't get back in.
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to rejoin room ${roomId}:`, message);
      notifyApiError('Could not rejoin room', message);
      return null;
    }
  },

  startGame: async (roomId: string, playerSecret: string): Promise<{ status: string }> => {
    const response = await api.post(`/rooms/${roomId}/start_game/`, {
      player_secret: playerSecret,
    });
    return response.data;
  },

  submitTile: async (
    tileId: string,
    audioFile: File,
    playerId: string,
  ): Promise<{ status: string }> => {
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

  /**
   * Upload a tile's audio with real progress reporting and cancel support.
   *
   * Uses XMLHttpRequest (not axios) because axios does not expose upload
   * progress + an abort handle in a single ergonomic call. Returns the parsed
   * backend response; on failure it throws an Error whose `.message` is the
   * backend's `error` string when present (so the UI can surface specifics).
   */
  uploadTile: (
    tileId: string,
    audioFile: File,
    playerId: string,
    options: {
      onProgress?: (percent: number) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<GameState> =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('audio_file', audioFile);
      formData.append('player_id', playerId);

      const xhr = new XMLHttpRequest();
      const url = `${API_BASE_URL}/tiles/${tileId}/play_tile/`;

      xhr.open('POST', url);
      // Auth headers (mirror api.ts interceptors) for the raw XHR.
      const access = getStoredAccessToken();
      if (access) xhr.setRequestHeader('Authorization', `Bearer ${access}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && options.onProgress) {
          options.onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data?.error || `Upload failed (HTTP ${xhr.status})`));
          }
        } catch {
          reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));

      options.signal?.addEventListener('abort', () => xhr.abort());

      xhr.send(formData);
    }),

  resetGame: async (
    roomId: string,
    playerSecret: string,
  ): Promise<{ status: string; round?: number }> => {
    const response = await api.post(`/rooms/${roomId}/reset_game/`, {
      player_secret: playerSecret,
    });
    return response.data;
  },

  kickPlayer: async (
    roomId: string,
    playerId: string,
    playerSecret: string,
  ): Promise<{ status: string }> => {
    const response = await api.post(`/rooms/${roomId}/kick_player/`, {
      player_id: playerId,
      player_secret: playerSecret,
    });
    return response.data;
  },

  castVote: async (
    roomId: string,
    playerSecret: string,
    votedForPlayerId: string,
  ): Promise<{ status: string }> => {
    const response = await api.post(`/rooms/${roomId}/vote/`, {
      player_secret: playerSecret,
      voted_for_player_id: votedForPlayerId,
    });
    return response.data;
  },

  nextTurn: async (roomId: string, playerSecret: string): Promise<{ status: string }> => {
    const response = await api.post(`/rooms/${roomId}/next_turn/`, {
      player_secret: playerSecret,
    });
    return response.data;
  },

  openVoting: async (roomId: string, playerSecret: string): Promise<{ status: string }> => {
    const response = await api.post(`/rooms/${roomId}/open_voting/`, {
      player_secret: playerSecret,
    });
    return response.data;
  },

  toggleReady: async (
    roomId: string,
    playerId: string,
    playerSecret: string,
  ): Promise<{ player_id: string; is_ready: boolean }> => {
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
    return response.data.map((p: BackendPlayer) => transformPlayer(p));
  },

  setCheckedIn: async (
    playerId: string,
    isCheckedIn: boolean,
    adminSecret: string,
  ): Promise<Player> => {
    const response = await api.post(
      `/players/by-id/${playerId}/set_checked_in/`,
      {
        is_checked_in: isCheckedIn,
      },
      {
        headers: {
          'X-Theme-Admin-Secret': adminSecret,
        },
      },
    );
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
  handleCallback: async (
    code: string,
    state: string,
  ): Promise<{
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
  linkAccount: async (
    playerId: string,
    playerSecret: string,
    discordData: {
      discord_user_id: string;
      discord_username: string;
      discord_avatar_url?: string;
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    },
  ): Promise<DiscordLinkResponse & { status: string }> => {
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
  getAccountStatus: async (
    playerId: string,
    playerSecret: string,
  ): Promise<{
    is_linked: boolean;
    discord_user_id?: string;
    discord_username?: string;
    discord_avatar_url?: string;
    discord_session_secret?: string;
    linked_at?: string;
    last_sync_at?: string;
    privacy_settings?: Record<string, unknown>;
  }> => {
    const response = await api.post('/auth/discord/status/', {
      player_id: playerId,
      player_secret: playerSecret,
    });
    return response.data;
  },

  getAccountStatusBySession: async (
    discordUserId: string,
    sessionSecret: string,
  ): Promise<{
    is_linked: boolean;
    discord_user_id?: string;
    discord_username?: string;
    discord_avatar_url?: string;
    discord_session_secret?: string;
    linked_at?: string;
    last_sync_at?: string;
    privacy_settings?: Record<string, unknown>;
  }> => {
    const response = await api.post('/auth/discord/status/', {
      discord_user_id: discordUserId,
      discord_session_secret: sessionSecret,
    });
    return response.data;
  },
};

function transformPlayer(backendPlayer: BackendPlayer): Player {
  return {
    id: backendPlayer.id,
    name: backendPlayer.name ?? backendPlayer.player_name ?? '',
    avatar: backendPlayer.avatar,
    isDiscordVerified: backendPlayer.is_discord_verified,
    discordUsername: backendPlayer.discord_username,
    discordAvatarUrl: backendPlayer.discord_avatar_url,
    board: backendPlayer.board ?? {
      tiles: (backendPlayer.tiles || []).map((tile) => ({
        id: tile.id,
        genre: tile.genre,
        status: tile.status,
        audioUrl: tile.audio_url,
      })),
    },
    playerSecret: backendPlayer.player_secret,
    isConnected: backendPlayer.is_connected,
    isSpectator: backendPlayer.is_spectator,
    isHost: backendPlayer.is_host,
    isReady: backendPlayer.is_ready,
    eloRating: backendPlayer.elo_rating,
    eloWins: backendPlayer.elo_wins,
    eloLosses: backendPlayer.elo_losses,
    eloMatches: backendPlayer.elo_matches,
    isCheckedIn: backendPlayer.is_checked_in,
    currentTitle: backendPlayer.current_title,
    scoreInfo: backendPlayer.scoreInfo,
  };
}

export function normalizeRoomWinner(winner: RoomResponse['winner']): string | undefined {
  if (!winner) {
    return undefined;
  }

  return typeof winner === 'string' ? winner : winner.id;
}

export interface LeaderboardUser {
  id: string;
  display_name: string;
  elo_rating: number;
  elo_wins: number;
  elo_losses: number;
  elo_matches: number;
  is_verified: boolean;
}

export const leaderboardApi = {
  global: async (): Promise<{ leaderboard: LeaderboardUser[] }> => {
    const response = await api.get('/leaderboard/');
    return response.data;
  },
};

export default api;

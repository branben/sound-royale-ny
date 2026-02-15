import axios from 'axios';
import { Player, Tile, RoomResponse, CreateRoomResponse } from '@/types/game';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
});

export const roomApi = {
  getRooms: async (): Promise<RoomResponse[]> => {
    const response = await api.get('/rooms/');
    return response.data;
  },

  getRoom: async (roomId: string): Promise<RoomResponse> => {
    const response = await api.get(`/rooms/${roomId}/`);
    return response.data;
  },

  createRoom: async (roomName: string, playerName: string): Promise<CreateRoomResponse> => {
    const response = await api.post('/rooms/', {
      name: roomName,
      player_name: playerName,
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
    return transformPlayer(response.data);
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

  submitTile: async (tileId: string, audioFile: File): Promise<any> => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);

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
    isConnected: backendPlayer.is_connected,
    isSpectator: backendPlayer.is_spectator,
  };
}

export default api;

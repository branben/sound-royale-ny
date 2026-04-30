import axios from 'axios';
import * as fs from 'fs';

const API_BASE_URL = process.env.LIVE_API_BASE_URL || 'http://localhost:8000/api';

export async function getGameState(roomCode: string) {
  const response = await axios.get(`${API_BASE_URL}/rooms/${roomCode}/game_state/`);
  return response.data;
}

export async function joinRoom(roomCode: string, playerName: string, isSpectator: boolean = false, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(`${API_BASE_URL}/rooms/${roomCode}/join_game/`, {
        player_name: playerName,
        is_spectator: isSpectator
      });
      return response.data;
    } catch (error: any) {
      if (i === retries - 1) throw error;
      if (error.response?.status === 500) {
        console.log(`joinRoom 500 error, retrying in 500ms... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      throw error;
    }
  }
  throw new Error('joinRoom failed after retries');
}

export async function startGame(roomCode: string) {
  const response = await axios.post(`${API_BASE_URL}/rooms/${roomCode}/start_game/`);
  return response.data;
}

export async function submitTile(tileId: string, audioFilePath: string, playerSecret: string) {
  const buffer = fs.readFileSync(audioFilePath);
  const formData = new FormData();
  formData.append('audio_file', new File([buffer], 'test-audio.wav', { type: 'audio/wav' }));
  formData.append('player_secret', playerSecret);

  // Let axios set Content-Type with boundary automatically
  const response = await axios.post(`${API_BASE_URL}/tiles/${tileId}/play_tile/`, formData);
  return response.data;
}

export async function nextTurn(roomCode: string, playerSecret: string) {
  const response = await axios.post(`${API_BASE_URL}/rooms/${roomCode}/next_turn/`, {
    player_secret: playerSecret
  });
  return response.data;
}

export async function openVoting(roomCode: string, playerSecret: string) {
  const response = await axios.post(`${API_BASE_URL}/rooms/${roomCode}/open_voting/`, {
    player_secret: playerSecret
  });
  return response.data;
}

export async function castVote(roomCode: string, playerSecret: string, votedForPlayerId: string) {
  const response = await axios.post(`${API_BASE_URL}/rooms/${roomCode}/vote/`, {
    player_secret: playerSecret,
    voted_for_player_id: votedForPlayerId
  });
  return response.data;
}

export async function toggleReady(roomCode: string, playerSecret: string) {
  const response = await axios.post(`${API_BASE_URL}/rooms/${roomCode}/toggle_ready/`, {
    player_secret: playerSecret,
  });
  return response.data;
}

export async function pollGameState(roomCode: string, condition: (state: any) => boolean, timeout = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const state = await getGameState(roomCode);
    if (condition(state)) {
      return state;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Timeout waiting for game state condition');
}

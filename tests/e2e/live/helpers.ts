import axios from 'axios';
import * as fs from 'fs';

function getApiBaseUrl(): string {
  return process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 12): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error.response?.status;
      if (i === maxRetries - 1) {
        console.log(
          `${label} FINAL ${status} on ${error.config?.method?.toUpperCase() ?? '?'} ${error.config?.url ?? '?'} :: ${JSON.stringify(error.response?.data || {}).slice(0, 200)}`,
        );
        throw error;
      }
      if (status === 429) {
        const backoff = Math.pow(2, i) * 1000;
        console.log(
          `${label} 429 rate limited, retrying in ${backoff}ms... (${i + 1}/${maxRetries})`,
        );
        await sleep(backoff);
        continue;
      }
      if (status === 500) {
        const backoff = Math.min(Math.pow(2, i) * 1000, 8000);
        console.log(`${label} 500 error, retrying in ${backoff}ms... (${i + 1}/${maxRetries})`);
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`${label} failed after ${maxRetries} retries`);
}

export async function getGameState(roomCode: string) {
  return withRetry(
    () => axios.get(`${getApiBaseUrl()}/rooms/${roomCode}/game_state/`).then((r) => r.data),
    `getGameState(${roomCode})`,
  );
}

export async function joinRoom(roomCode: string, playerName: string, isSpectator: boolean = false) {
  return withRetry(
    () =>
      axios
        .post(`${getApiBaseUrl()}/rooms/${roomCode}/join_game/`, {
          name: playerName,
          is_spectator: isSpectator,
        })
        .then((r) => r.data),
    `joinRoom(${roomCode})`,
  );
}

export async function startGame(roomCode: string, playerSecret: string) {
  return withRetry(
    () =>
      axios
        .post(`${getApiBaseUrl()}/rooms/${roomCode}/start_game/`, {
          player_secret: playerSecret,
        })
        .then((r) => r.data),
    `startGame(${roomCode})`,
  );
}

export async function submitTile(
  tileId: string,
  audioFilePath: string,
  playerSecret: string,
  playerId: string,
) {
  return withRetry(async () => {
    const buffer = fs.readFileSync(audioFilePath);
    const formData = new FormData();
    formData.append('audio_file', new File([buffer], 'test-audio.wav', { type: 'audio/wav' }));
    formData.append('player_secret', playerSecret);
    formData.append('player_id', playerId);
    const response = await axios.post(`${getApiBaseUrl()}/tiles/${tileId}/play_tile/`, formData);
    return response.data;
  }, `submitTile(${tileId})`);
}

export async function nextTurn(roomCode: string, playerSecret: string) {
  return withRetry(
    () =>
      axios
        .post(`${getApiBaseUrl()}/rooms/${roomCode}/next_turn/`, {
          player_secret: playerSecret,
        })
        .then((r) => r.data),
    `nextTurn(${roomCode})`,
  );
}

export async function openVoting(roomCode: string, playerSecret: string) {
  return withRetry(
    () =>
      axios
        .post(`${getApiBaseUrl()}/rooms/${roomCode}/open_voting/`, {
          player_secret: playerSecret,
        })
        .then((r) => r.data),
    `openVoting(${roomCode})`,
  );
}

export async function castVote(roomCode: string, playerSecret: string, votedForPlayerId: string) {
  return withRetry(
    () =>
      axios
        .post(`${getApiBaseUrl()}/rooms/${roomCode}/vote/`, {
          player_secret: playerSecret,
          voted_for_player_id: votedForPlayerId,
        })
        .then((r) => r.data),
    `castVote(${roomCode})`,
  );
}

export async function toggleReady(roomCode: string, playerSecret: string, playerId: string) {
  return withRetry(
    () =>
      axios
        .post(`${getApiBaseUrl()}/rooms/${roomCode}/toggle_ready/`, {
          player_id: playerId,
          player_secret: playerSecret,
        })
        .then((r) => r.data),
    `toggleReady(${roomCode})`,
  );
}

export async function pollGameState(
  roomCode: string,
  condition: (state: any) => boolean,
  timeout = 30000,
) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const state = await getGameState(roomCode);
    if (condition(state)) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Timeout waiting for game state condition');
}

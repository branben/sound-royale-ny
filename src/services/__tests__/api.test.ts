import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { roomApi, gameApi, discordApi, leaderboardApi, normalizeRoomWinner } from '../api';
import type {
  BackendPlayer,
  GenrePerformance,
  CreateRoomResponse,
  ThemeRotation,
} from '@/types/game';

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

// Catch-all for the axios error interceptor's POST /errors/log/ so it
// doesn't trigger MSW's onUnhandledRequest or cause infinite loops.
const errorLogHandler = http.post(
  'http://localhost:8000/api/errors/log/',
  () => new HttpResponse(null, { status: 204 }),
);

const server = setupServer(errorLogHandler);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
// Re-register the error-log catch-all after every resetHandlers()
afterEach(() => server.use(errorLogHandler));
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = 'http://localhost:8000/api';

function jsonBody(request: Request): Promise<Record<string, unknown>> {
  return request.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

const mockPlayer: BackendPlayer = {
  id: 'player-1',
  name: 'Alice',
  player_name: 'Alice',
  avatar: 'https://example.com/avatar.png',
  is_discord_verified: false,
  discord_username: null as unknown as undefined,
  discord_avatar_url: undefined,
  player_secret: 'secret-abc',
  is_connected: true,
  is_spectator: false,
  is_host: true,
  is_ready: false,
  elo_rating: 1200,
  elo_wins: 10,
  elo_losses: 5,
  elo_matches: 15,
  is_checked_in: false,
  current_title: 'NONE' as const,
  tiles: [
    { id: 'tile-1', genre: 'Phonk', status: 'empty', audio_url: undefined },
    { id: 'tile-2', genre: 'Trap', status: 'complete', audio_url: 'https://example.com/audio.mp3' },
  ],
};

// ============================================================================
// roomApi
// ============================================================================
describe('roomApi', () => {
  // -----------------------------------------------------------------------
  // getRooms
  // -----------------------------------------------------------------------
  describe('getRooms', () => {
    it('returns a list of rooms', async () => {
      server.use(
        http.get(`${API_BASE}/rooms/`, () =>
          HttpResponse.json([
            { code: 'ROOM1', status: 'lobby', players: [], current_round: 0 },
            { code: 'ROOM2', status: 'playing', players: [], current_round: 3 },
          ]),
        ),
      );

      const rooms = await roomApi.getRooms();
      expect(rooms).toHaveLength(2);
      expect(rooms[0].code).toBe('ROOM1');
      expect(rooms[1].status).toBe('playing');
    });

    it('throws on 500 server error', async () => {
      server.use(
        http.get(
          `${API_BASE}/rooms/`,
          () => new HttpResponse('Internal Server Error', { status: 500 }),
        ),
      );

      await expect(roomApi.getRooms()).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // getRoom
  // -----------------------------------------------------------------------
  describe('getRoom', () => {
    it('returns room details for a valid room code', async () => {
      server.use(
        http.get(`${API_BASE}/rooms/ROOM1/`, () =>
          HttpResponse.json({
            code: 'ROOM1',
            status: 'lobby',
            players: [mockPlayer],
            current_round: 0,
            total_rounds: 5,
            theme: 'classic',
          }),
        ),
      );

      const room = await roomApi.getRoom('ROOM1');
      expect(room.code).toBe('ROOM1');
      expect(room.status).toBe('lobby');
      expect(room.players).toHaveLength(1);
      expect(room.total_rounds).toBe(5);
    });

    it('throws on 404 for non-existent room', async () => {
      server.use(
        http.get(
          `${API_BASE}/rooms/NOPE/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Room not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(roomApi.getRoom('NOPE')).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // createRoom
  // -----------------------------------------------------------------------
  describe('createRoom', () => {
    it('sends correct payload and returns room code + player info', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json<CreateRoomResponse>({
            room_code: 'ABC123',
            player_id: 'player-new',
            player_secret: 'secret-new',
          });
        }),
      );

      const result = await roomApi.createRoom('My Room', 'Alice', 5, 'classic');

      expect(body).toEqual({
        name: 'My Room',
        player_name: 'Alice',
        total_rounds: 5,
        theme: 'classic',
      });
      expect(result.room_code).toBe('ABC123');
      expect(result.player_id).toBe('player-new');
      expect(result.player_secret).toBe('secret-new');
    });

    it('includes custom_genres when provided', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json<CreateRoomResponse>({
            room_code: 'GENR1',
            player_id: 'p1',
            player_secret: 's1',
          });
        }),
      );

      await roomApi.createRoom('Genre Room', 'Bob', undefined, undefined, ['Phonk', 'Lo-Fi']);

      expect(body.custom_genres).toEqual(['Phonk', 'Lo-Fi']);
      expect(body.theme).toBeUndefined();
    });

    it('sends discord session payload when provided', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json<CreateRoomResponse>({
            room_code: 'DISC1',
            player_id: 'p1',
            player_secret: 's1',
          });
        }),
      );

      const discordSession = {
        discordUserId: 'discord-123',
        sessionSecret: 'ds-secret',
        username: 'verified_user',
      };

      await roomApi.createRoom(
        'Discord Room',
        'Alice',
        undefined,
        undefined,
        undefined,
        discordSession,
      );

      expect(body.discord_user_id).toBe('discord-123');
      expect(body.discord_session_secret).toBe('ds-secret');
    });

    it('omits optional fields when not provided', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json<CreateRoomResponse>({
            room_code: 'MINRL',
            player_id: 'p1',
            player_secret: 's1',
          });
        }),
      );

      await roomApi.createRoom('Minimal', 'Player');

      expect(body).toEqual({
        name: 'Minimal',
        player_name: 'Player',
      });
      expect(body.total_rounds).toBeUndefined();
      expect(body.theme).toBeUndefined();
      expect(body.custom_genres).toBeUndefined();
    });

    it('throws on 400 for invalid input', async () => {
      server.use(
        http.post(
          `${API_BASE}/rooms/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Room name required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(roomApi.createRoom('', '')).rejects.toThrow();
    });

    it('throws on 409 for duplicate room', async () => {
      server.use(
        http.post(
          `${API_BASE}/rooms/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Room already exists' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(roomApi.createRoom('Dup Room', 'Alice')).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // getThemeRotations
  // -----------------------------------------------------------------------
  describe('getThemeRotations', () => {
    it('returns theme rotation list', async () => {
      server.use(
        http.get(`${API_BASE}/theme-rotations/`, () =>
          HttpResponse.json<ThemeRotation[]>([
            {
              key: 'classic',
              name: 'Classic',
              description: 'All genres',
              genres: ['Phonk', 'Trap'],
            },
            { key: 'weekly', name: 'Weekly', description: 'This week', genres: ['Lo-Fi'] },
          ]),
        ),
      );

      const themes = await roomApi.getThemeRotations();
      expect(themes).toHaveLength(2);
      expect(themes[0].key).toBe('classic');
    });
  });

  // -----------------------------------------------------------------------
  // updateThemeRotation
  // -----------------------------------------------------------------------
  describe('updateThemeRotation', () => {
    it('sends PUT with admin secret header', async () => {
      let headers: Headers | undefined;
      server.use(
        http.put(`${API_BASE}/theme-rotations/weekly/`, async ({ request }) => {
          headers = request.headers;
          return HttpResponse.json<ThemeRotation>({
            key: 'weekly',
            name: 'Updated Weekly',
            description: 'New description',
            genres: ['House'],
          });
        }),
      );

      await roomApi.updateThemeRotation(
        'weekly',
        { name: 'Updated Weekly', description: 'New description', genres: ['House'] },
        'admin-secret-123',
      );

      expect(headers!.get('X-Theme-Admin-Secret')).toBe('admin-secret-123');
    });

    it('throws on 403 for invalid admin secret', async () => {
      server.use(
        http.put(
          `${API_BASE}/theme-rotations/weekly/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Forbidden' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(
        roomApi.updateThemeRotation(
          'weekly',
          { name: 'Hacked', description: '', genres: [] },
          'wrong-secret',
        ),
      ).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // getRoomStats
  // -----------------------------------------------------------------------
  describe('getRoomStats', () => {
    it('returns room stats on success', async () => {
      server.use(
        http.get(`${API_BASE}/rooms/ROOM1/stats/`, () =>
          HttpResponse.json({ total_games: 42, active_players: 7 }),
        ),
      );

      const stats = await roomApi.getRoomStats('ROOM1');
      expect(stats.total_games).toBe(42);
      expect(stats.active_players).toBe(7);
    });

    it('logs and re-throws on error', async () => {
      server.use(
        http.get(
          `${API_BASE}/rooms/NOPE/stats/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(roomApi.getRoomStats('NOPE')).rejects.toThrow();
    });
  });
});

// ===========================================================================
// roomApi.uploadAudio
// ===========================================================================
describe('uploadAudio', () => {
  const makeFile = (name: string, type: string, size = 2048): File =>
    new File([new Uint8Array(size)], name, { type });

  it('POSTs to the tile play_tile endpoint and resolves on success', async () => {
    let url = '';
    server.use(
      http.post(`${API_BASE}/tiles/TILE1/play_tile/`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ status: 'ok' });
      }),
    );

    const file = makeFile('track.mp3', 'audio/mpeg');
    const result = await roomApi.uploadAudio('TILE1', file, 'player-1');

    expect(url).toContain('/tiles/TILE1/play_tile/');
    expect(result).toEqual({ status: 'ok' });
  });

  it('rejects (throws) on 400 invalid file type', async () => {
    server.use(
      http.post(
        `${API_BASE}/tiles/TILE1/play_tile/`,
        () =>
          new HttpResponse(JSON.stringify({ error: 'Invalid file type provided.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const file = makeFile('track.mp3', 'audio/mpeg');
    await expect(roomApi.uploadAudio('TILE1', file, 'player-1')).rejects.toThrow();
  });

  it('rejects (throws) on 400 file too large', async () => {
    server.use(
      http.post(
        `${API_BASE}/tiles/TILE1/play_tile/`,
        () =>
          new HttpResponse(JSON.stringify({ error: 'File too large. Maximum size is 10MB.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const file = makeFile('track.mp3', 'audio/mpeg');
    await expect(roomApi.uploadAudio('TILE1', file, 'player-1')).rejects.toThrow();
  });

  it('rejects (throws) on network error', async () => {
    server.use(
      http.post(`${API_BASE}/tiles/TILE1/play_tile/`, () => {
        throw new Error('Network failure');
      }),
    );

    const file = makeFile('track.mp3', 'audio/mpeg');
    await expect(roomApi.uploadAudio('TILE1', file, 'player-1')).rejects.toThrow();
  });
});

// ===========================================================================
// gameApi
// ===========================================================================
describe('gameApi', () => {
  // -----------------------------------------------------------------------
  // getGameState
  // -----------------------------------------------------------------------
  describe('getGameState', () => {
    it('returns parsed game state', async () => {
      server.use(
        http.get(`${API_BASE}/rooms/ROOM1/game_state/`, () =>
          HttpResponse.json({
            gameId: 'game-1',
            roomCode: 'ROOM1',
            status: 'playing',
            players: { [mockPlayer.id]: { ...mockPlayer, board: { tiles: [] } } },
            currentRound: 2,
            totalRounds: 5,
          }),
        ),
      );

      const state = await gameApi.getGameState('ROOM1');
      expect(state.gameId).toBe('game-1');
      expect(state.status).toBe('playing');
      expect(state.currentRound).toBe(2);
    });

    it('throws on 500 error', async () => {
      server.use(
        http.get(
          `${API_BASE}/rooms/BAD/game_state/`,
          () => new HttpResponse('Server Error', { status: 500 }),
        ),
      );

      await expect(gameApi.getGameState('BAD')).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // joinRoom
  // -----------------------------------------------------------------------
  describe('joinRoom', () => {
    it('sends correct request and transforms response', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/join_game/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json(mockPlayer);
        }),
      );

      const player = await gameApi.joinRoom('ROOM1', 'Alice');

      expect(body).toEqual({
        name: 'Alice',
        is_spectator: false,
      });
      expect(player.id).toBe('player-1');
      expect(player.name).toBe('Alice');
      expect(player.isHost).toBe(true);
      expect(player.playerSecret).toBe('secret-abc');
    });

    it('sets is_spectator true when flag is passed', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/join_game/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json(mockPlayer);
        }),
      );

      await gameApi.joinRoom('ROOM1', 'Bob', true);

      expect(body.is_spectator).toBe(true);
    });

    it('includes discord session in join payload', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/join_game/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json(mockPlayer);
        }),
      );

      await gameApi.joinRoom('ROOM1', 'Alice', false, {
        discordUserId: 'discord-456',
        sessionSecret: 'ds-join-secret',
        username: 'discord_user',
      });

      expect(body.discord_user_id).toBe('discord-456');
      expect(body.discord_session_secret).toBe('ds-join-secret');
    });

    it('throws on 404 for non-existent room', async () => {
      server.use(
        http.post(
          `${API_BASE}/rooms/NOPE/join_game/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Room not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(gameApi.joinRoom('NOPE', 'Alice')).rejects.toThrow();
    });

    it('throws on 409 for duplicate player name', async () => {
      server.use(
        http.post(
          `${API_BASE}/rooms/ROOM1/join_game/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Name already taken' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(gameApi.joinRoom('ROOM1', 'Alice')).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // rejoinRoom
  // -----------------------------------------------------------------------
  describe('rejoinRoom', () => {
    it('returns player on successful rejoin', async () => {
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/rejoin_game/`, () => HttpResponse.json(mockPlayer)),
      );

      const player = await gameApi.rejoinRoom('ROOM1', 'old-secret');
      expect(player).not.toBeNull();
      expect(player!.id).toBe('player-1');
      expect(player!.playerSecret).toBe('old-secret');
    });

    it('returns null on failed rejoin (invalid secret)', async () => {
      server.use(
        http.post(
          `${API_BASE}/rooms/ROOM1/rejoin_game/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Invalid secret' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      const player = await gameApi.rejoinRoom('ROOM1', 'bad-secret');
      expect(player).toBeNull();
    });

    it('returns null on 404', async () => {
      server.use(
        http.post(
          `${API_BASE}/rooms/NOPE/rejoin_game/`,
          () => new HttpResponse('Not found', { status: 404 }),
        ),
      );

      const player = await gameApi.rejoinRoom('NOPE', 'secret');
      expect(player).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // startGame
  // -----------------------------------------------------------------------
  describe('startGame', () => {
    it('sends player_secret and returns status', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/start_game/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json({ status: 'started' });
        }),
      );

      const result = await gameApi.startGame('ROOM1', 'secret-xyz');

      expect(body).toEqual({ player_secret: 'secret-xyz' });
      expect(result.status).toBe('started');
    });

    it('throws on 403 for non-host player', async () => {
      server.use(
        http.post(
          `${API_BASE}/rooms/ROOM1/start_game/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Only host can start' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(gameApi.startGame('ROOM1', 'not-host-secret')).rejects.toThrow();
    });

    it('throws on 400 when not enough players', async () => {
      server.use(
        http.post(
          `${API_BASE}/rooms/ROOM1/start_game/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Need at least 2 players' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(gameApi.startGame('ROOM1', 'secret')).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // submitTile
  // -----------------------------------------------------------------------
  describe('submitTile', () => {
    it('sends FormData with audio_file and player_id', async () => {
      let receivedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${API_BASE}/tiles/tile-1/play_tile/`, async ({ request }) => {
          // Parse the raw text body to verify FormData was sent
          const text = await request.text();
          // Verify the body contains expected fields
          receivedBody = { text, contentType: request.headers.get('Content-Type') || '' };
          return HttpResponse.json({ status: 'ok' });
        }),
      );

      const file = new File(['audio-bytes'], 'sample.mp3', { type: 'audio/mpeg' });
      const result = await gameApi.submitTile('tile-1', file, 'player-1');

      expect(result.status).toBe('ok');
      // Verify FormData was sent (body should contain multipart boundary markers)
      expect(receivedBody.text as string).toContain('audio_file');
      expect(receivedBody.text as string).toContain('player_id');
      // Content-Type should include multipart/form-data
      expect(receivedBody.contentType as string).toContain('multipart/form-data');
    });
  });

  // -----------------------------------------------------------------------
  // resetGame
  // -----------------------------------------------------------------------
  describe('resetGame', () => {
    it('sends player_secret and returns status with round', async () => {
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/reset_game/`, () =>
          HttpResponse.json({ status: 'reset', round: 1 }),
        ),
      );

      const result = await gameApi.resetGame('ROOM1', 'secret');
      expect(result.status).toBe('reset');
      expect(result.round).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // kickPlayer
  // -----------------------------------------------------------------------
  describe('kickPlayer', () => {
    it('sends both player_id and player_secret', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/kick_player/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json({ status: 'kicked' });
        }),
      );

      await gameApi.kickPlayer('ROOM1', 'player-2', 'host-secret');

      expect(body).toEqual({
        player_id: 'player-2',
        player_secret: 'host-secret',
      });
    });
  });

  // -----------------------------------------------------------------------
  // castVote
  // -----------------------------------------------------------------------
  describe('castVote', () => {
    it('sends player_secret and voted_for_player_id', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/vote/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json({ status: 'voted' });
        }),
      );

      await gameApi.castVote('ROOM1', 'voter-secret', 'player-2');

      expect(body).toEqual({
        player_secret: 'voter-secret',
        voted_for_player_id: 'player-2',
      });
    });
  });

  // -----------------------------------------------------------------------
  // nextTurn
  // -----------------------------------------------------------------------
  describe('nextTurn', () => {
    it('sends player_secret', async () => {
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/next_turn/`, () =>
          HttpResponse.json({ status: 'next_turn' }),
        ),
      );

      const result = await gameApi.nextTurn('ROOM1', 'secret');
      expect(result.status).toBe('next_turn');
    });
  });

  // -----------------------------------------------------------------------
  // openVoting
  // -----------------------------------------------------------------------
  describe('openVoting', () => {
    it('sends player_secret', async () => {
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/open_voting/`, () =>
          HttpResponse.json({ status: 'voting_opened' }),
        ),
      );

      const result = await gameApi.openVoting('ROOM1', 'secret');
      expect(result.status).toBe('voting_opened');
    });
  });

  // -----------------------------------------------------------------------
  // toggleReady
  // -----------------------------------------------------------------------
  describe('toggleReady', () => {
    it('sends player_id and player_secret, returns state', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/rooms/ROOM1/toggle_ready/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json({ player_id: 'p1', is_ready: true });
        }),
      );

      const result = await gameApi.toggleReady('ROOM1', 'p1', 'secret');

      expect(body).toEqual({ player_id: 'p1', player_secret: 'secret' });
      expect(result.is_ready).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getGenrePerformance
  // -----------------------------------------------------------------------
  describe('getGenrePerformance', () => {
    it('returns genre performance data', async () => {
      server.use(
        http.get(`${API_BASE}/players/by-id/player-1/genre_performance/`, () =>
          HttpResponse.json<GenrePerformance[]>([
            { genre: 'Phonk', wins: 8, total_rounds: 10, win_rate: 0.8, grade: 'S' },
            { genre: 'Trap', wins: 3, total_rounds: 10, win_rate: 0.3, grade: 'C' },
          ]),
        ),
      );

      const perf = await gameApi.getGenrePerformance('player-1');
      expect(perf).toHaveLength(2);
      expect(perf[0].grade).toBe('S');
    });
  });

  // -----------------------------------------------------------------------
  // getAllPlayers
  // -----------------------------------------------------------------------
  describe('getAllPlayers', () => {
    it('returns transformed player list', async () => {
      server.use(
        http.get(`${API_BASE}/players/`, () =>
          HttpResponse.json([mockPlayer, { ...mockPlayer, id: 'player-2', name: 'Bob' }]),
        ),
      );

      const players = await gameApi.getAllPlayers();
      expect(players).toHaveLength(2);
      expect(players[0].id).toBe('player-1');
      expect(players[1].name).toBe('Bob');
    });
  });

  // -----------------------------------------------------------------------
  // setCheckedIn
  // -----------------------------------------------------------------------
  describe('setCheckedIn', () => {
    it('sends is_checked_in and admin header', async () => {
      let headers: Headers | undefined;
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/players/by-id/player-1/set_checked_in/`, async ({ request }) => {
          headers = request.headers;
          body = await jsonBody(request);
          return HttpResponse.json(mockPlayer);
        }),
      );

      await gameApi.setCheckedIn('player-1', true, 'admin-secret');

      expect(body).toEqual({ is_checked_in: true });
      expect(headers!.get('X-Theme-Admin-Secret')).toBe('admin-secret');
    });
  });

  // -----------------------------------------------------------------------
  // Network failure handling
  // -----------------------------------------------------------------------
  describe('network failure handling', () => {
    it('getRooms throws on network error', async () => {
      server.use(http.get(`${API_BASE}/rooms/`, () => HttpResponse.error()));

      await expect(roomApi.getRooms()).rejects.toThrow();
    });

    it('joinRoom throws on network error', async () => {
      server.use(http.post(`${API_BASE}/rooms/ROOM1/join_game/`, () => HttpResponse.error()));

      await expect(gameApi.joinRoom('ROOM1', 'Alice')).rejects.toThrow();
    });

    it('startGame throws on network error', async () => {
      server.use(http.post(`${API_BASE}/rooms/ROOM1/start_game/`, () => HttpResponse.error()));

      await expect(gameApi.startGame('ROOM1', 'secret')).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // 5xx error handling
  // -----------------------------------------------------------------------
  describe('5xx error handling', () => {
    it('getGameState throws on 502', async () => {
      server.use(
        http.get(
          `${API_BASE}/rooms/ROOM1/game_state/`,
          () => new HttpResponse('Bad Gateway', { status: 502 }),
        ),
      );

      await expect(gameApi.getGameState('ROOM1')).rejects.toThrow();
    });

    it('castVote throws on 503', async () => {
      server.use(
        http.post(
          `${API_BASE}/rooms/ROOM1/vote/`,
          () => new HttpResponse('Service Unavailable', { status: 503 }),
        ),
      );

      await expect(gameApi.castVote('ROOM1', 'secret', 'p2')).rejects.toThrow();
    });
  });
});

// ============================================================================
// discordApi
// ============================================================================
describe('discordApi', () => {
  // -----------------------------------------------------------------------
  // getAuthUrl
  // -----------------------------------------------------------------------
  describe('getAuthUrl', () => {
    it('returns authorization URL and state', async () => {
      server.use(
        http.get(`${API_BASE}/auth/discord/`, () =>
          HttpResponse.json({
            authorization_url: 'https://discord.com/oauth2/authorize?client_id=abc',
            state: 'random-state-123',
          }),
        ),
      );

      const result = await discordApi.getAuthUrl();
      expect(result.authorization_url).toContain('discord.com');
      expect(result.state).toBe('random-state-123');
    });
  });

  // -----------------------------------------------------------------------
  // handleCallback
  // -----------------------------------------------------------------------
  describe('handleCallback', () => {
    it('sends code and state as query params', async () => {
      server.use(
        http.get(`${API_BASE}/auth/discord/callback/`, ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get('code')).toBe('auth-code');
          expect(url.searchParams.get('state')).toBe('oauth-state');
          return HttpResponse.json({
            discord_user_id: 'discord-789',
            discord_username: 'testuser',
            discriminator: '1234',
            avatar: 'abc.png',
            access_token: 'access-xyz',
            refresh_token: 'refresh-abc',
            expires_in: 604800,
          });
        }),
      );

      const result = await discordApi.handleCallback('auth-code', 'oauth-state');
      expect(result.discord_user_id).toBe('discord-789');
      expect(result.discord_username).toBe('testuser');
      expect(result.access_token).toBe('access-xyz');
    });

    it('throws on 400 for invalid code', async () => {
      server.use(
        http.get(
          `${API_BASE}/auth/discord/callback/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Invalid code' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(discordApi.handleCallback('bad-code', 'state')).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // linkAccount
  // -----------------------------------------------------------------------
  describe('linkAccount', () => {
    it('sends player data and discord data', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/auth/discord/link/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json({
            status: 'linked',
            discord_user_id: 'discord-123',
            discord_session_secret: 'ds-secret',
            discord_username: 'linked_user',
            linked_at: '2026-05-08T18:00:00Z',
          });
        }),
      );

      const result = await discordApi.linkAccount('player-1', 'p-secret', {
        discord_user_id: 'discord-123',
        discord_username: 'linked_user',
        discord_avatar_url: 'https://cdn.discordapp.com/avatar.png',
        access_token: 'access-xyz',
        refresh_token: 'refresh-abc',
        expires_in: 604800,
      });

      expect(result.status).toBe('linked');
      expect(body.player_id).toBe('player-1');
      expect(body.player_secret).toBe('p-secret');
      expect(body.discord_user_id).toBe('discord-123');
      expect(body.access_token).toBe('access-xyz');
    });

    it('omits discord_avatar_url when not provided', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${API_BASE}/auth/discord/link/`, async ({ request }) => {
          body = await jsonBody(request);
          return HttpResponse.json({ status: 'linked' });
        }),
      );

      await discordApi.linkAccount('player-1', 'p-secret', {
        discord_user_id: 'discord-123',
        discord_username: 'user',
        access_token: 'token',
        refresh_token: undefined,
        expires_in: 604800,
      });

      expect(body.discord_avatar_url).toBeUndefined();
    });

    it('throws on 400 for missing player_secret', async () => {
      server.use(
        http.post(
          `${API_BASE}/auth/discord/link/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Authentication required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(
        discordApi.linkAccount('player-1', '', {
          discord_user_id: 'discord-123',
          discord_username: 'user',
          access_token: 'token',
          expires_in: 3600,
        }),
      ).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // unlinkAccount
  // -----------------------------------------------------------------------
  describe('unlinkAccount', () => {
    it('sends player credentials and returns status', async () => {
      server.use(
        http.post(`${API_BASE}/auth/discord/unlink/`, () =>
          HttpResponse.json({ status: 'unlinked' }),
        ),
      );

      const result = await discordApi.unlinkAccount('player-1', 'secret');
      expect(result.status).toBe('unlinked');
    });

    it('throws on 404 for unknown player', async () => {
      server.use(
        http.post(
          `${API_BASE}/auth/discord/unlink/`,
          () =>
            new HttpResponse(JSON.stringify({ error: 'Player not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );

      await expect(discordApi.unlinkAccount('ghost', 'secret')).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // getAccountStatus
  // -----------------------------------------------------------------------
  describe('getAccountStatus', () => {
    it('sends player_id and player_secret as query params', async () => {
      server.use(
        http.get(`${API_BASE}/auth/discord/status/`, ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get('player_id')).toBe('player-1');
          expect(url.searchParams.get('player_secret')).toBe('secret');
          return HttpResponse.json({
            is_linked: true,
            discord_user_id: 'discord-123',
            discord_username: 'testuser',
            linked_at: '2026-05-08T18:00:00Z',
          });
        }),
      );

      const result = await discordApi.getAccountStatus('player-1', 'secret');
      expect(result.is_linked).toBe(true);
      expect(result.discord_username).toBe('testuser');
    });

    it('returns is_linked: false when not linked', async () => {
      server.use(
        http.get(`${API_BASE}/auth/discord/status/`, () => HttpResponse.json({ is_linked: false })),
      );

      const result = await discordApi.getAccountStatus('player-1', 'secret');
      expect(result.is_linked).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getAccountStatusBySession
  // -----------------------------------------------------------------------
  describe('getAccountStatusBySession', () => {
    it('sends discord_user_id and session secret as query params', async () => {
      server.use(
        http.get(`${API_BASE}/auth/discord/status/`, ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get('discord_user_id')).toBe('discord-456');
          expect(url.searchParams.get('discord_session_secret')).toBe('sess-secret');
          return HttpResponse.json({
            is_linked: true,
            discord_user_id: 'discord-456',
            discord_username: 'verified',
          });
        }),
      );

      const result = await discordApi.getAccountStatusBySession('discord-456', 'sess-secret');
      expect(result.is_linked).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Network error handling
  // -----------------------------------------------------------------------
  describe('network error handling', () => {
    it('getAuthUrl throws on network error', async () => {
      server.use(http.get(`${API_BASE}/auth/discord/`, () => HttpResponse.error()));

      await expect(discordApi.getAuthUrl()).rejects.toThrow();
    });

    it('linkAccount throws on network error', async () => {
      server.use(http.post(`${API_BASE}/auth/discord/link/`, () => HttpResponse.error()));

      await expect(
        discordApi.linkAccount('p', 's', {
          discord_user_id: 'd',
          discord_username: 'u',
          access_token: 'a',
          expires_in: 0,
        }),
      ).rejects.toThrow();
    });
  });
});

// ============================================================================
// leaderboardApi
// ============================================================================
describe('leaderboardApi', () => {
  it('returns global leaderboard', async () => {
    server.use(
      http.get(`${API_BASE}/leaderboard/`, () =>
        HttpResponse.json({
          leaderboard: [
            {
              id: 'player-1',
              display_name: 'Alice',
              elo_rating: 1500,
              elo_wins: 20,
              elo_losses: 10,
              elo_matches: 30,
              is_verified: true,
            },
          ],
        }),
      ),
    );

    const result = await leaderboardApi.global();
    expect(result.leaderboard).toHaveLength(1);
    expect(result.leaderboard[0].display_name).toBe('Alice');
    expect(result.leaderboard[0].elo_rating).toBe(1500);
  });

  it('throws on 500', async () => {
    server.use(
      http.get(`${API_BASE}/leaderboard/`, () => new HttpResponse('Server Error', { status: 500 })),
    );

    await expect(leaderboardApi.global()).rejects.toThrow();
  });

  it('throws on network error', async () => {
    server.use(http.get(`${API_BASE}/leaderboard/`, () => HttpResponse.error()));

    await expect(leaderboardApi.global()).rejects.toThrow();
  });
});

// ============================================================================
// normalizeRoomWinner
// ============================================================================
describe('normalizeRoomWinner', () => {
  it('returns undefined for null', () => {
    expect(normalizeRoomWinner(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(normalizeRoomWinner(undefined)).toBeUndefined();
  });

  it('returns string as-is when winner is a string', () => {
    expect(normalizeRoomWinner('player-1')).toBe('player-1');
  });

  it('extracts id when winner is an object', () => {
    expect(normalizeRoomWinner({ id: 'player-42' })).toBe('player-42');
  });
});

// ============================================================================
// transformPlayer (exercised via getAllPlayers, joinRoom, etc.)
// ============================================================================
describe('transformPlayer (via API responses)', () => {
  it('maps backend snake_case to frontend camelCase', async () => {
    const backendPlayer: BackendPlayer = {
      id: 'bp-1',
      player_name: 'SnakePlayer',
      avatar: 'https://example.com/ava.png',
      is_discord_verified: true,
      discord_username: 'snake_user',
      discord_avatar_url: 'https://discord.com/ava.png',
      player_secret: 'ps-1',
      is_connected: true,
      is_spectator: false,
      is_host: false,
      is_ready: true,
      elo_rating: 1300,
      elo_wins: 5,
      elo_losses: 3,
      elo_matches: 8,
      is_checked_in: true,
      current_title: 'JACKPOT' as const,
      board: {
        tiles: [
          {
            id: 't1',
            genre: 'House',
            status: 'complete' as const,
            audioUrl: 'https://audio.com/t1.mp3',
          },
        ],
      },
    };

    server.use(
      http.post(`${API_BASE}/rooms/ROOM1/join_game/`, () => HttpResponse.json(backendPlayer)),
    );

    const player = await gameApi.joinRoom('ROOM1', 'SnakePlayer');

    expect(player.id).toBe('bp-1');
    expect(player.name).toBe('SnakePlayer'); // maps from player_name
    expect(player.avatar).toBe('https://example.com/ava.png');
    expect(player.isDiscordVerified).toBe(true);
    expect(player.discordUsername).toBe('snake_user');
    expect(player.discordAvatarUrl).toBe('https://discord.com/ava.png');
    expect(player.playerSecret).toBe('ps-1');
    expect(player.isConnected).toBe(true);
    expect(player.isSpectator).toBe(false);
    expect(player.isHost).toBe(false);
    expect(player.isReady).toBe(true);
    expect(player.eloRating).toBe(1300);
    expect(player.eloWins).toBe(5);
    expect(player.eloLosses).toBe(3);
    expect(player.eloMatches).toBe(8);
    expect(player.isCheckedIn).toBe(true);
    expect(player.currentTitle).toBe('JACKPOT');
  });

  it('maps tiles to board tiles', async () => {
    const backendPlayer: BackendPlayer = {
      id: 'bp-2',
      name: 'TilePlayer',
      tiles: [
        { id: 't1', genre: 'Phonk', status: 'empty' as const },
        {
          id: 't2',
          genre: 'Trap',
          status: 'complete' as const,
          audio_url: 'https://audio.com/a.mp3',
        },
        { id: 't3', genre: 'Lo-Fi', status: 'pending' as const },
      ],
    };

    server.use(
      http.post(`${API_BASE}/rooms/ROOM1/join_game/`, () => HttpResponse.json(backendPlayer)),
    );

    const player = await gameApi.joinRoom('ROOM1', 'TilePlayer');

    expect(player.board.tiles).toHaveLength(3);
    expect(player.board.tiles[0]).toEqual({
      id: 't1',
      genre: 'Phonk',
      status: 'empty',
      audioUrl: undefined,
    });
    expect(player.board.tiles[1]).toEqual({
      id: 't2',
      genre: 'Trap',
      status: 'complete',
      audioUrl: 'https://audio.com/a.mp3',
    });
    expect(player.board.tiles[2]).toEqual({
      id: 't3',
      genre: 'Lo-Fi',
      status: 'pending',
      audioUrl: undefined,
    });
  });

  it('prefers name over player_name', async () => {
    const backendPlayer: BackendPlayer = {
      id: 'bp-3',
      name: 'Primary',
      player_name: 'Fallback',
    };

    server.use(
      http.post(`${API_BASE}/rooms/ROOM1/join_game/`, () => HttpResponse.json(backendPlayer)),
    );

    const player = await gameApi.joinRoom('ROOM1', 'NameTest');
    expect(player.name).toBe('Primary');
  });

  it('falls back to player_name when name is undefined', async () => {
    const backendPlayer: BackendPlayer = {
      id: 'bp-4',
      player_name: 'OnlyPlayerName',
    };

    server.use(
      http.post(`${API_BASE}/rooms/ROOM1/join_game/`, () => HttpResponse.json(backendPlayer)),
    );

    const player = await gameApi.joinRoom('ROOM1', 'NameTest');
    expect(player.name).toBe('OnlyPlayerName');
  });

  it('defaults name to empty string when both are missing', async () => {
    const backendPlayer: BackendPlayer = {
      id: 'bp-5',
    };

    server.use(
      http.post(`${API_BASE}/rooms/ROOM1/join_game/`, () => HttpResponse.json(backendPlayer)),
    );

    const player = await gameApi.joinRoom('ROOM1', 'NameTest');
    expect(player.name).toBe('');
  });

  it('uses tiles when board is not provided', async () => {
    const backendPlayer: BackendPlayer = {
      id: 'bp-6',
      name: 'TilesOnly',
      tiles: [{ id: 't1', genre: 'Drill', status: 'empty' as const }],
    };

    server.use(
      http.post(`${API_BASE}/rooms/ROOM1/join_game/`, () => HttpResponse.json(backendPlayer)),
    );

    const player = await gameApi.joinRoom('ROOM1', 'Test');
    expect(player.board.tiles).toHaveLength(1);
    expect(player.board.tiles[0].genre).toBe('Drill');
  });

  it('defaults board to empty tiles when neither board nor tiles present', async () => {
    const backendPlayer: BackendPlayer = {
      id: 'bp-7',
      name: 'NoBoard',
    };

    server.use(
      http.post(`${API_BASE}/rooms/ROOM1/join_game/`, () => HttpResponse.json(backendPlayer)),
    );

    const player = await gameApi.joinRoom('ROOM1', 'Test');
    expect(player.board.tiles).toEqual([]);
  });
});

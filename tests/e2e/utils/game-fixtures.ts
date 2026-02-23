import { test as base, Page } from '@playwright/test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { randomUUID } from 'crypto';

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// ============================================
// TYPES - Matching Django Serializers
// ============================================

interface TileData {
  id: string;
  genre: string;
  status: 'empty' | 'pending' | 'complete';
  audioUrl?: string;
  position: number;
}

interface ScoreInfoData {
  score: number;
  base_score: number;
  bonuses: Array<{ type: string; points: number }>;
  lines: Array<{ type: string; positions: number[] }>;
}

interface PlayerData {
  id: string;
  name: string;
  avatar?: string;
  isSpectator: boolean;
  isConnected: boolean;
  board: {
    tiles: TileData[];
  };
  scoreInfo?: ScoreInfoData;
  // ELO fields
  eloRating?: number;
  eloWins?: number;
  eloLosses?: number;
  eloMatches?: number;
}

interface VoteData {
  id: string;
  voter: string;
  voterName: string;
  votedFor: string;
  votedForName: string;
}

interface RoundStateData {
  roundNumber: number;
  currentTileGenre: string;
  timerDuration: number;
  timerEndsAt: string | null;
  votingOpen: boolean;
  votesRecorded: number;
  votes: VoteData[];
  winner: string | null;
}

interface GameStateData {
  id: string;
  gameId: string;
  status: 'waiting' | 'playing' | 'finished';
  currentRound: number;
  winner: string | null;
  players: Record<string, PlayerData>;
  roundState: RoundStateData | null;
  spectatorCount: number;
}

// ============================================
// MOCK DATA CREATORS - For E2E Testing
// ============================================

/**
 * Create a mock tile for bingo board
 */
export function createMockTile(
  position: number,
  genre: string = 'TestGenre',
  status: 'empty' | 'pending' | 'complete' = 'empty'
): TileData {
  return {
    id: `tile-${randomUUID().slice(0, 8)}`,
    genre,
    status,
    position,
    audioUrl: status === 'complete' ? `https://example.com/audio/${genre}.mp3` : undefined,
  };
}

/**
 * Create a mock 3x3 bingo board
 */
export function createMockBoard(
  genres: string[] = ['Rock', 'Jazz', 'HipHop', 'Pop', 'Electronic', 'R&B', 'Country', 'Classical', 'Metal']
): { tiles: TileData[] } {
  return {
    tiles: genres.map((genre, i) => createMockTile(i, genre, 'empty')),
  };
}

/**
 * Create mock score info
 */
export function createMockScoreInfo(
  score: number = 100,
  lines: number = 1,
  bonuses: Array<{ type: string; points: number }> = []
): ScoreInfoData {
  const lineTypes = ['row', 'column', 'diagonal'];
  return {
    score,
    base_score: score - bonuses.reduce((sum, b) => sum + b.points, 0),
    bonuses,
    lines: Array.from({ length: lines }, (_, i) => ({
      type: lineTypes[i % 3],
      positions: [0, 1, 2],
    })),
  };
}

/**
 * Create a mock vote
 */
export function createMockVote(
  voterId: string,
  voterName: string,
  votedForId: string,
  votedForName: string
): VoteData {
  return {
    id: `vote-${randomUUID().slice(0, 8)}`,
    voter: voterId,
    voterName,
    votedFor: votedForId,
    votedForName,
  };
}

/**
 * Create mock ELO rating info
 */
export function createMockELOInfo(
  rating: number = 1200,
  wins: number = 0,
  losses: number = 0,
  matches: number = 0
): { eloRating: number; eloWins: number; eloLosses: number; eloMatches: number } {
  return {
    eloRating: rating,
    eloWins: wins,
    eloLosses: losses,
    eloMatches: matches,
  };
}

/**
 * Create a mock player (producer or spectator)
 */
export function createMockPlayer(
  name: string,
  options: {
    isSpectator?: boolean;
    isHost?: boolean;
    board?: { tiles: TileData[] };
    scoreInfo?: ScoreInfoData;
    eloRating?: number;
    eloWins?: number;
    eloLosses?: number;
    eloMatches?: number;
    isConnected?: boolean;
  } = {}
): PlayerData {
  const {
    isSpectator = false,
    isHost = false,
    board = createMockBoard(),
    scoreInfo,
    eloRating = 1200,
    eloWins = 0,
    eloLosses = 0,
    eloMatches = 0,
    isConnected = true,
  } = options;

  return {
    id: `player-${randomUUID().slice(0, 8)}`,
    name,
    avatar: undefined,
    isSpectator,
    isConnected,
    board: isSpectator ? { tiles: [] } : board,
    scoreInfo,
    eloRating,
    eloWins,
    eloLosses,
    eloMatches,
  };
}

/**
 * Create a mock producer (player who competes)
 */
export function createMockProducer(
  name: string,
  options?: Partial<Omit<Parameters<typeof createMockPlayer>[1], 'isSpectator'>>
): PlayerData {
  return createMockPlayer(name, { ...options, isSpectator: false });
}

/**
 * Create a mock spectator (non-competing viewer)
 */
export function createMockSpectator(
  name: string,
  options?: Partial<Omit<Parameters<typeof createMockPlayer>[1], 'isSpectator'>>
): PlayerData {
  return createMockPlayer(name, { ...options, isSpectator: true });
}

/**
 * Create a mock host producer
 */
export function createMockHostProducer(
  name: string = 'HostPlayer',
  options?: Partial<Omit<Parameters<typeof createMockPlayer>[1], 'isSpectator' | 'isHost'>>
): PlayerData {
  return createMockProducer(name, { ...options });
}

/**
 * Create a mock round state
 */
export function createMockRoundState(
  roundNumber: number = 1,
  options: {
    currentTileGenre?: string;
    timerDuration?: number;
    timerEndsAt?: string | null;
    votingOpen?: boolean;
    votesRecorded?: number;
    votes?: VoteData[];
    winner?: string | null;
  } = {}
): RoundStateData {
  const {
    currentTileGenre = 'Rock',
    timerDuration = 60,
    timerEndsAt = null,
    votingOpen = false,
    votesRecorded = 0,
    votes = [],
    winner = null,
  } = options;

  return {
    roundNumber,
    currentTileGenre,
    timerDuration,
    timerEndsAt,
    votingOpen,
    votesRecorded,
    votes,
    winner,
  };
}

/**
 * Create a mock complete game state (matches GameStateSerializer)
 */
export function createMockGameState(
  options: {
    id?: string;
    status?: 'waiting' | 'playing' | 'finished';
    currentRound?: number;
    winner?: string | null;
    players?: Record<string, PlayerData>;
    roundState?: RoundStateData | null;
    spectatorCount?: number;
  } = {}
): GameStateData {
  const {
    id = `room-${randomUUID().slice(0, 8)}`,
    status = 'waiting',
    currentRound = 1,
    winner = null,
    players = {},
    roundState = null,
    spectatorCount = 0,
  } = options;

  // Calculate spectator count if not provided
  const calculatedSpectatorCount = spectatorCount || 
    Object.values(players).filter(p => p.isSpectator).length;

  return {
    id,
    gameId: id,
    status,
    currentRound,
    winner,
    players,
    roundState,
    spectatorCount: calculatedSpectatorCount,
  };
}

/**
 * Create a complete lobby state with multiple players
 */
export function createMockLobbyState(
  hostName: string = 'HostPlayer',
  playerNames: string[] = ['Player1', 'Player2'],
  spectatorNames: string[] = ['Spectator1']
): GameStateData {
  const players: Record<string, PlayerData> = {};
  
  // Add host
  const host = createMockHostProducer(hostName);
  players[host.id] = host;
  
  // Add regular producers
  playerNames.forEach(name => {
    const player = createMockProducer(name);
    players[player.id] = player;
  });
  
  // Add spectators
  spectatorNames.forEach(name => {
    const spectator = createMockSpectator(name);
    players[spectator.id] = spectator;
  });

  return createMockGameState({
    status: 'waiting',
    players,
    roundState: null,
  });
}

/**
 * Create a playing state with a round in progress
 */
export function createMockPlayingState(
  players: Record<string, PlayerData>,
  roundNumber: number = 1,
  roundOptions?: Parameters<typeof createMockRoundState>[1]
): GameStateData {
  return createMockGameState({
    status: 'playing',
    currentRound: roundNumber,
    players,
    roundState: createMockRoundState(roundNumber, roundOptions),
  });
}

/**
 * Create a voting state
 */
export function createMockVotingState(
  players: Record<string, PlayerData>,
  roundNumber: number = 1,
  votes: VoteData[] = []
): GameStateData {
  return createMockGameState({
    status: 'playing',
    currentRound: roundNumber,
    players,
    roundState: createMockRoundState(roundNumber, {
      votingOpen: true,
      votesRecorded: votes.length,
      votes,
    }),
  });
}

/**
 * Create a finished game state
 */
export function createMockFinishedState(
  players: Record<string, PlayerData>,
  winnerId: string | null = null,
  totalRounds: number = 3
): GameStateData {
  return createMockGameState({
    status: 'finished',
    currentRound: totalRounds,
    winner: winnerId,
    players,
    roundState: createMockRoundState(totalRounds, {
      votingOpen: false,
      winner: winnerId,
    }),
  });
}

// GameStateManager fixture for managing mock game state
class GameStateManager {
  private gameState: GameStateData;
  private server: any;

  constructor() {
    this.gameState = createMockPlayingState({});
    this.server = setupServer();
  }

  async setup() {
    this.server.listen();
    this.setupRoutes();
  }

  async teardown() {
    this.server.close();
  }

  private setupRoutes() {
    this.server.use(
      http.get(`${API_BASE_URL}/rooms/:id`, ({ params }) => {
        return HttpResponse.json(this.gameState);
      }),
      http.post(`${API_BASE_URL}/rooms/:id/join`, async ({ request }) => {
        const body = (await request.json()) as { name?: string };
        const player = createMockProducer(body.name || 'TestPlayer');
        this.gameState.players[player.id] = player;
        return HttpResponse.json({ playerId: player.id, playerSecret: 'test-secret' });
      })
    );
  }

  setGameState(state: Partial<GameStateData>) {
    this.gameState = { ...this.gameState, ...state };
  }

  addPlayer(playerData: Omit<PlayerData, 'id'>) {
    const playerId = randomUUID();
    this.gameState.players[playerId] = { ...playerData, id: playerId };
    return playerId;
  }

  updatePlayer(playerId: string, updates: Partial<PlayerData>) {
    if (this.gameState.players[playerId]) {
      this.gameState.players[playerId] = {
        ...this.gameState.players[playerId],
        ...updates
      };
    }
  }

  completeTiles(playerId: string, positions: number[]) {
    if (!this.gameState.players[playerId]) return;

    positions.forEach(pos => {
      const tile = this.gameState.players[playerId].board.tiles.find(t => t.position === pos);
      if (tile) {
        tile.status = 'complete';
        tile.audioUrl = `test-audio-${pos}.mp3`;
      }
    });
  }

  getRoomUrl() {
    return `/room/${encodeURIComponent(this.gameState.id)}`;
  }

  getGameState() {
    return this.gameState;
  }
}

// PlayerContext fixture for managing individual player actions
class PlayerContext {
  private page: Page;
  private gameManager: GameStateManager;
  private playerId: string;

  constructor(page: Page, gameManager: GameStateManager, playerId: string) {
    this.page = page;
    this.gameManager = gameManager;
    this.playerId = playerId;
  }

  async joinRoom(playerName: string = 'TestPlayer') {
    await this.page.goto('/');
    await this.page.getByRole('button', { name: 'Create New Battle' }).click();
    await this.page.fill('input[placeholder*="Enter a name for your new battle"]', 'TestBattle');
    await this.page.getByRole('button', { name: 'Join' }).click();

    // Wait for room creation
    await this.page.waitForSelector('[data-testid="room-id"]');

    // Get the room URL from the page
    const roomUrl = this.page.url();
    this.gameManager.setGameState({ id: roomUrl.split('/').pop() || 'test-room' });

    return roomUrl;
  }

  async completeTile(position: number, genre?: string) {
    // Mock tile completion in game state
    this.gameManager.completeTiles(this.playerId, [position]);

    // In real scenario, this would trigger UI updates via WebSocket
    // For testing, we can directly update the mock state
  }

  async waitForBingoNotification() {
    return this.page.waitForSelector('text=/BINGO!/');
  }

  async getScoreDisplay() {
    return this.page.locator('[data-testid="score-display"]').first();
  }
}

// Extended test fixture
type TestFixtures = {
  gameManager: GameStateManager;
  playerContext: PlayerContext;
};

export const test = base.extend<TestFixtures>({
  gameManager: async ({}, use) => {
    const manager = new GameStateManager();
    await manager.setup();
    await use(manager);
    await manager.teardown();
  },

  playerContext: async ({ page, gameManager }, use) => {
    const playerId = gameManager.addPlayer({
      name: 'TestPlayer',
      board: { tiles: [] },
      isSpectator: false,
      isConnected: true,
      scoreInfo: createMockScoreInfo()
    });

    const context = new PlayerContext(page, gameManager, playerId);
    await use(context);
  }
});

export { GameStateManager, PlayerContext };

// ============================================
// ENHANCED GAMESTATE MANAGER METHODS
// ============================================

/**
 * Add a producer to the game state
 */
export function addProducerToState(
  state: GameStateData,
  name: string,
  options?: Partial<PlayerData>
): { state: GameStateData; playerId: string } {
  const player = createMockProducer(name, options);
  return {
    state: {
      ...state,
      players: { ...state.players, [player.id]: player },
      spectatorCount: state.spectatorCount,
    },
    playerId: player.id,
  };
}

/**
 * Add a spectator to the game state
 */
export function addSpectatorToState(
  state: GameStateData,
  name: string
): { state: GameStateData; spectatorId: string } {
  const spectator = createMockSpectator(name);
  return {
    state: {
      ...state,
      players: { ...state.players, [spectator.id]: spectator },
      spectatorCount: state.spectatorCount + 1,
    },
    spectatorId: spectator.id,
  };
}

/**
 * Add a vote to the game state
 */
export function addVoteToState(
  state: GameStateData,
  voterId: string,
  voterName: string,
  votedForId: string,
  votedForName: string
): GameStateData {
  if (!state.roundState) return state;

  const vote = createMockVote(voterId, voterName, votedForId, votedForName);
  return {
    ...state,
    roundState: {
      ...state.roundState,
      votes: [...state.roundState.votes, vote],
      votesRecorded: state.roundState.votesRecorded + 1,
    },
  };
}

/**
 * Update ELO ratings after a game
 */
export function updateELORatings(
  state: GameStateData,
  winnerId: string
): GameStateData {
  const updatedPlayers = { ...state.players };
  
  Object.keys(updatedPlayers).forEach(playerId => {
    const player = updatedPlayers[playerId];
    if (player.isSpectator) return;
    
    const isWinner = playerId === winnerId;
    const eloChange = isWinner ? 25 : -15;
    
    updatedPlayers[playerId] = {
      ...player,
      eloRating: (player.eloRating || 1200) + eloChange,
      eloWins: isWinner ? (player.eloWins || 0) + 1 : player.eloWins || 0,
      eloLosses: isWinner ? player.eloLosses || 0 : (player.eloLosses || 0) + 1,
      eloMatches: (player.eloMatches || 0) + 1,
    };
  });

  return { ...state, players: updatedPlayers };
}
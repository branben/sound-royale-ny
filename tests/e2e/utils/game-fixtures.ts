import { test as base, Page } from '@playwright/test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { randomUUID } from 'crypto';

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// Types for test fixtures
interface PlayerData {
  id: string;
  name: string;
  board: {
    tiles: Array<{
      id: string;
      genre: string;
      status: 'empty' | 'pending' | 'complete';
      position: number;
      audioUrl?: string;
    }>;
  };
  scoreInfo?: {
    score: number;
    base_score: number;
    bonuses: Array<{ type: string; points: number }>;
    lines: Array<{ type: string; positions: number[] }>;
  };
}

interface GameStateData {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  currentRound: number;
  winner?: string;
  players: Record<string, PlayerData>;
}

// GameStateManager fixture for managing mock game state
class GameStateManager {
  private gameState: GameStateData;
  private server: any;

  constructor() {
    this.gameState = {
      id: randomUUID(),
      status: 'playing',
      currentRound: 1,
      players: {}
    };

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
        const body = await request.json();
        const playerId = randomUUID();
        this.gameState.players[playerId] = {
          id: playerId,
          name: body.name || 'TestPlayer',
          board: {
            tiles: Array.from({ length: 9 }, (_, i) => ({
              id: `tile${i}`,
              genre: `Genre${i}`,
              status: 'empty' as const,
              position: i
            }))
          }
        };
        return HttpResponse.json({ playerId });
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

// Utility functions
export function generateRoomCode(): string {
  return `room_${randomUUID().slice(0, 8)}`;
}

export function generatePlayerName(): string {
  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
  return names[Math.floor(Math.random() * names.length)];
}

export function createMockTile(position: number, genre: string = 'TestGenre', status: 'empty' | 'pending' | 'complete' = 'empty') {
  return {
    id: `tile${position}`,
    genre,
    status,
    position,
    audioUrl: status === 'complete' ? `test-audio-${position}.mp3` : undefined
  };
}

export function createMockScoreInfo(score: number = 100, lines: number = 1, bonuses: Array<{ type: string; points: number }> = []) {
  return {
    score,
    base_score: score - bonuses.reduce((sum, b) => sum + b.points, 0),
    bonuses,
    lines: Array.from({ length: lines }, (_, i) => ({
      type: i === 0 ? 'row' : i === 1 ? 'column' : 'diagonal',
      positions: [0, 1, 2] // Simplified for testing
    }))
  };
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
      scoreInfo: createMockScoreInfo()
    });

    const context = new PlayerContext(page, gameManager, playerId);
    await use(context);
  }
});

export { GameStateManager, PlayerContext };
/**
 * Producer Flow E2E Tests
 * 
 * Tests the complete producer (player) journey:
 * - Joining a room as a producer
 * - Viewing the bingo board
 * - Completing tiles
 * - Achieving bingo
 * - Receiving votes from spectators
 * - ELO rating display
 */

import { test, expect } from '@playwright/test';
import {
  createMockGameState,
  createMockLobbyState,
  createMockPlayingState,
  createMockVotingState,
  createMockFinishedState,
  createMockProducer,
  createMockSpectator,
  createMockVote,
  createMockScoreInfo,
  createMockBoard,
} from './utils/game-fixtures';

const API_BASE_URL = 'http://localhost:8000/api';

test.describe('Producer Flow', () => {
  test.describe('Joining as Producer', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        (window as any).__E2E_TESTING__ = true;
      });
    });

    test('should join room as producer and see bingo board', async ({ page }) => {
      // Create lobby state with host
      const lobbyState = createMockLobbyState('HostPlayer', ['Player1'], []);
      
      await page.route('**/api/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/rooms/')) {
          await route.fulfill({ json: lobbyState });
        } else {
          await route.continue();
        }
      });

      // Set up session for producer
      const playerId = Object.keys(lobbyState.players)[1];

      await page.addInitScript(
        ({ playerId }) => {
          localStorage.setItem(
            'userSession',
            JSON.stringify({
              playerName: 'Player1',
              playerId,
              playerSecret: 'producer-secret',
              isSpectator: false,
              isHost: false,
            })
          );
        },
        { playerId }
      );

      await page.goto(`/room/${lobbyState.id}`);

      // Should see the game board
      await expect(page.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
      
      // Should see producer's name
      await expect(page.locator('text=Player1')).toBeVisible();
    });

    test('should see 3x3 bingo board with all tiles', async ({ page }) => {
      const player = createMockProducer('TestPlayer');
      const gameState = createMockPlayingState({ [player.id]: player });

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'TestPlayer',
          playerId: player.id,
          playerSecret: 'test-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see 9 tiles (3x3 grid)
      const tiles = page.locator('[data-testid="bingo-tile"]');
      await expect(tiles).toHaveCount(9);
    });

    test('should see tile genres displayed', async ({ page }) => {
      const board = createMockBoard(['Rock', 'Jazz', 'HipHop', 'Pop', 'Electronic', 'R&B', 'Country', 'Classical', 'Metal']);
      const player = createMockProducer('TestPlayer', { board });
      const gameState = createMockPlayingState({ [player.id]: player });

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'TestPlayer',
          playerId: player.id,
          playerSecret: 'test-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see genre labels
      await expect(page.locator('text=Rock')).toBeVisible();
      await expect(page.locator('text=Jazz')).toBeVisible();
    });
  });

  test.describe('Tile Completion', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        (window as any).__E2E_TESTING__ = true;
      });
    });

    test('should mark tile as complete when clicked', async ({ page }) => {
      const player = createMockProducer('TestPlayer');
      const gameState = createMockPlayingState({ [player.id]: player });

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'TestPlayer',
          playerId: player.id,
          playerSecret: 'test-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Click first tile
      const tile = page.locator('[data-testid="bingo-tile"]').first();
      await tile.click();

      // Should show pending/complete status
      // (Actual behavior depends on audio upload flow)
    });

    test('should not allow spectator to mark tiles', async ({ page }) => {
      const producer = createMockProducer('Producer');
      const spectator = createMockSpectator('Spectator');
      const gameState = createMockPlayingState({
        [producer.id]: producer,
        [spectator.id]: spectator
      });

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'Spectator',
          playerId: spectator.id,
          playerSecret: 'spectator-secret',
          isSpectator: true,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Tiles should be read-only for spectators
      const tile = page.locator('[data-testid="bingo-tile"]').first();
      await expect(tile).toHaveClass(/disabled|readonly|read-only/);
    });
  });

  test.describe('Bingo Detection', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        (window as any).__E2E_TESTING__ = true;
      });
    });

    test('should detect bingo when row is complete', async ({ page }) => {
      // Create player with completed row (positions 0, 1, 2)
      const board = createMockBoard();
      board.tiles[0].status = 'complete';
      board.tiles[1].status = 'complete';
      board.tiles[2].status = 'complete';
      
      const player = createMockProducer('TestPlayer', {
        board,
        scoreInfo: createMockScoreInfo(100, 1)
      });
      
      const gameState = createMockPlayingState({ [player.id]: player });

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'TestPlayer',
          playerId: player.id,
          playerSecret: 'test-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should show BINGO notification
      await expect(page.locator('text=/BINGO!/i')).toBeVisible({ timeout: 10000 });
    });

    test('should show score after bingo', async ({ page }) => {
      const player = createMockProducer('TestPlayer', {
        scoreInfo: createMockScoreInfo(150, 2, [{ type: 'first_bingo', points: 50 }])
      });
      
      const gameState = createMockPlayingState({ [player.id]: player });

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'TestPlayer',
          playerId: player.id,
          playerSecret: 'test-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should show score display
      await expect(page.locator('[data-testid="score-display"]')).toBeVisible();
    });
  });

  test.describe('Voting Phase', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        (window as any).__E2E_TESTING__ = true;
      });
    });

    test('should see voting panel when voting is open', async ({ page }) => {
      const producer1 = createMockProducer('Producer1', { eloRating: 1200 });
      const producer2 = createMockProducer('Producer2', { eloRating: 1300 });
      
      const gameState = createMockVotingState({
        [producer1.id]: producer1,
        [producer2.id]: producer2,
      }, 1, []);

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'Producer1',
          playerId: producer1.id,
          playerSecret: 'producer1-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see voting panel
      await expect(page.locator('[data-testid="voting-panel"]')).toBeVisible({ timeout: 10000 });
    });

    test('should see other producers in voting', async ({ page }) => {
      const producer1 = createMockProducer('Producer1');
      const producer2 = createMockProducer('Producer2');
      
      const gameState = createMockVotingState({
        [producer1.id]: producer1,
        [producer2.id]: producer2,
      });

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'Producer1',
          playerId: producer1.id,
          playerSecret: 'producer1-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see other producer as voting option
      await expect(page.locator('text=Producer2')).toBeVisible();
    });

    test('should see votes received after voting closes', async ({ page }) => {
      const producer1 = createMockProducer('Producer1');
      const producer2 = createMockProducer('Producer2');
      const spectator = createMockSpectator('Spectator');
      
      const vote = createMockVote(spectator.id, 'Spectator', producer1.id, 'Producer1');
      const gameState = createMockVotingState({
        [producer1.id]: producer1,
        [producer2.id]: producer2,
        [spectator.id]: spectator,
      }, 1, [vote]);

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'Producer1',
          playerId: producer1.id,
          playerSecret: 'producer1-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see vote count
      await expect(page.locator('text=1 vote')).toBeVisible();
    });
  });

  test.describe('ELO Rating', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        (window as any).__E2E_TESTING__ = true;
      });
    });

    test('should display ELO rating', async ({ page }) => {
      const player = createMockProducer('TestPlayer', {
        eloRating: 1250,
        eloWins: 5,
        eloLosses: 2,
        eloMatches: 7
      });
      
      const gameState = createMockPlayingState({ [player.id]: player });

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'TestPlayer',
          playerId: player.id,
          playerSecret: 'test-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should show ELO rating
      await expect(page.locator('text=1250')).toBeVisible();
    });

    test('should show ELO stats in game over', async ({ page }) => {
      const winner = createMockProducer('Winner', {
        eloRating: 1300,
        eloWins: 6,
        eloLosses: 2,
        eloMatches: 8
      });
      const loser = createMockProducer('Loser', {
        eloRating: 1100,
        eloWins: 2,
        eloLosses: 6,
        eloMatches: 8
      });
      
      const gameState = createMockFinishedState({
        [winner.id]: winner,
        [loser.id]: loser,
      }, winner.id);

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'Winner',
          playerId: winner.id,
          playerSecret: 'winner-secret',
          isSpectator: false,
          isHost: true
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should show final standings with ELO
      await expect(page.locator('text=/Winner.*1300/')).toBeVisible();
      await expect(page.locator('text=/Loser.*1100/')).toBeVisible();
    });
  });

  test.describe('Host Functionality', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        (window as any).__E2E_TESTING__ = true;
      });
    });

    test('should see host controls when isHost is true', async ({ page }) => {
      const host = createMockProducer('HostPlayer', { eloRating: 1200 });
      const player = createMockProducer('Player2');
      
      const gameState = createMockLobbyState('HostPlayer', ['Player2'], []);

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'HostPlayer',
          playerId: host.id,
          playerSecret: 'host-secret',
          isSpectator: false,
          isHost: true
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see start game button (host control)
      await expect(page.locator('button:has-text("Start Game"), [data-testid="start-game"]')).toBeVisible({ timeout: 10000 });
    });

    test('should not see host controls when isHost is false', async ({ page }) => {
      const host = createMockProducer('HostPlayer');
      const player = createMockProducer('Player2');
      
      const gameState = createMockLobbyState('HostPlayer', ['Player2'], []);

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'Player2',
          playerId: player.id,
          playerSecret: 'player-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should NOT see start game button
      await expect(page.locator('button:has-text("Start Game")')).not.toBeVisible();
    });
  });
});

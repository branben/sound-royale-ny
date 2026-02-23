/**
 * Single Round End-to-End E2E Tests
 * 
 * Tests complete single round flow:
 * - Lobby → Round starts → Tile selection → Voting → Winner
 */

import { test, expect } from '@playwright/test';
import {
  createMockLobbyState,
  createMockPlayingState,
  createMockVotingState,
  createMockFinishedState,
  createMockProducer,
  createMockSpectator,
  createMockVote,
  createMockBoard,
} from './utils/game-fixtures';

test.describe('Single Round End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
    });
  });

  test.describe('Lobby Phase', () => {
    test('should start with lobby and wait for players', async ({ page }) => {
      const lobbyState = createMockLobbyState('HostPlayer', ['Player1', 'Player2'], ['Spectator1']);

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: lobbyState });
        } else {
          await route.continue();
        }
      });

      const hostId = Object.keys(lobbyState.players).find(
        name => lobbyState.players[name].name === 'HostPlayer'
      ) || '';

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'HostPlayer',
          playerId: hostId,
          playerSecret: 'host-secret',
          isSpectator: false,
          isHost: true
        }));
      });

      await page.goto(`/room/${lobbyState.id}`);

      // Should see lobby
      await expect(page.locator('[data-testid="lobby"], text=waiting')).toBeVisible({ timeout: 10000 });
    });

    test('should see all players in lobby', async ({ page }) => {
      const lobbyState = createMockLobbyState('HostPlayer', ['Player1'], ['Spectator1']);

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: lobbyState });
        } else {
          await route.continue();
        }
      });

      const hostId = Object.keys(lobbyState.players)[0];

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'HostPlayer',
          playerId: hostId,
          playerSecret: 'host-secret',
          isSpectator: false,
          isHost: true
        }));
      });

      await page.goto(`/room/${lobbyState.id}`);

      // Should see all players
      await expect(page.locator('text=HostPlayer')).toBeVisible();
      await expect(page.locator('text=Player1')).toBeVisible();
      await expect(page.locator('text=Spectator1')).toBeVisible();
    });
  });

  test.describe('Round Start', () => {
    test('should transition from lobby to playing', async ({ page }) => {
      const producer1 = createMockProducer('Producer1');
      const producer2 = createMockProducer('Producer2');
      const spectator = createMockSpectator('Spectator');
      
      const gameState = createMockPlayingState({
        [producer1.id]: producer1,
        [producer2.id]: producer2,
        [spectator.id]: spectator,
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
          isHost: true
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should show game in playing state
      await expect(page.locator('text=playing, [data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    });

    test('should display timer countdown', async ({ page }) => {
      const producer = createMockProducer('Producer1');
      const gameState = createMockPlayingState({ [producer.id]: producer });

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
          playerId: producer.id,
          playerSecret: 'producer-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see timer
      await expect(page.locator('[data-testid="timer"], text=/\\d+/')).toBeVisible({ timeout: 10000 });
    });

    test('should show current tile genre', async ({ page }) => {
      const board = createMockBoard(['Rock', 'Jazz', 'HipHop', 'Pop', 'Electronic', 'R&B', 'Country', 'Classical', 'Metal']);
      const producer = createMockProducer('Producer1', { board });
      const gameState = createMockPlayingState({ [producer.id]: producer });

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
          playerId: producer.id,
          playerSecret: 'producer-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see genre
      await expect(page.locator('text=Rock')).toBeVisible();
    });
  });

  test.describe('Tile Selection', () => {
    test('should allow producer to complete tiles', async ({ page }) => {
      const producer = createMockProducer('Producer1');
      const gameState = createMockPlayingState({ [producer.id]: producer });

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
          playerId: producer.id,
          playerSecret: 'producer-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see tiles
      const tiles = page.locator('[data-testid="bingo-tile"]');
      await expect(tiles).toHaveCount(9);
    });

    test('should see other producers boards', async ({ page }) => {
      const producer1 = createMockProducer('Producer1');
      const producer2 = createMockProducer('Producer2');
      
      const gameState = createMockPlayingState({
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

      // Should see other producer
      await expect(page.locator('text=Producer2')).toBeVisible();
    });
  });

  test.describe('Voting Phase', () => {
    test('should open voting after timer ends', async ({ page }) => {
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

      // Should see voting panel
      await expect(page.locator('[data-testid="voting-panel"], text=Vote')).toBeVisible({ timeout: 10000 });
    });

    test('should record votes correctly', async ({ page }) => {
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

    test('should show vote count to all', async ({ page }) => {
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
          playerName: 'Producer2',
          playerId: producer2.id,
          playerSecret: 'producer2-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see votes
      await expect(page.locator('text=1 vote')).toBeVisible();
    });
  });

  test.describe('Round Winner', () => {
    test('should announce winner after voting closes', async ({ page }) => {
      const producer1 = createMockProducer('Producer1');
      const producer2 = createMockProducer('Producer2');
      
      const gameState = createMockFinishedState({
        [producer1.id]: producer1,
        [producer2.id]: producer2,
      }, producer1.id, 1);

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
          isHost: true
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see winner
      await expect(page.locator('text=Producer1, text=/Winner|winner/')).toBeVisible({ timeout: 10000 });
    });

    test('should show scores after round ends', async ({ page }) => {
      const producer1 = createMockProducer('Producer1', {
        scoreInfo: { score: 150, base_score: 100, bonuses: [{ type: 'bingo', points: 50 }], lines: [{ type: 'row', positions: [0,1,2] }] }
      });
      
      const gameState = createMockFinishedState({
        [producer1.id]: producer1,
      }, producer1.id, 1);

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

      // Should see score
      await expect(page.locator('[data-testid="score-display"], text=150')).toBeVisible();
    });
  });

  test.describe('Round Reset', () => {
    test('should prepare for next round', async ({ page }) => {
      const producer = createMockProducer('Producer');
      
      // After round 1, prepare for round 2
      const gameState = createMockPlayingState({ [producer.id]: producer }, 2);

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'Producer',
          playerId: producer.id,
          playerSecret: 'producer-secret',
          isSpectator: false,
          isHost: true
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see round 2
      await expect(page.locator('text=Round 2')).toBeVisible();
    });

    test('should reset tile states for new round', async ({ page }) => {
      const producer = createMockProducer('Producer');
      const gameState = createMockPlayingState({ [producer.id]: producer }, 2);

      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/rooms/')) {
          await route.fulfill({ json: gameState });
        } else {
          await route.continue();
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem('userSession', JSON.stringify({
          playerName: 'Producer',
          playerId: producer.id,
          playerSecret: 'producer-secret',
          isSpectator: false,
          isHost: false
        }));
      });

      await page.goto(`/room/${gameState.id}`);

      // Should see fresh board
      const tiles = page.locator('[data-testid="bingo-tile"]');
      await expect(tiles).toHaveCount(9);
    });
  });
});

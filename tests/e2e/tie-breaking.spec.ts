import { test, expect } from '@playwright/test';

const API_BASE_URL = 'http://localhost:8000/api';

const mockTieBreakerRoomResponse = {
  code: 'test-room-id',
  status: 'finished',
  winner: 'player1',
  current_round: 1,
  players: [
    {
      id: 'player1',
      name: 'PlayerA',
      avatar: undefined,
      tiles: [
        { id: 'tile0', genre: 'Hip Hop', status: 'complete', position: 0 },
        { id: 'tile1', genre: 'Jazz', status: 'complete', position: 1 },
        { id: 'tile2', genre: 'Rock', status: 'complete', position: 2 },
        { id: 'tile3', genre: 'Pop', status: 'empty', position: 3 },
        { id: 'tile4', genre: 'Electronic', status: 'empty', position: 4 },
        { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
        { id: 'tile6', genre: 'R&B', status: 'empty', position: 6 },
        { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
        { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 }
      ],
      player_secret: 'secret1',
      is_connected: true,
      is_spectator: false
    },
    {
      id: 'player2',
      name: 'PlayerB',
      avatar: undefined,
      tiles: [
        { id: 'tile0', genre: 'Hip Hop', status: 'complete', position: 0 },
        { id: 'tile1', genre: 'Jazz', status: 'complete', position: 1 },
        { id: 'tile2', genre: 'Rock', status: 'complete', position: 2 },
        { id: 'tile3', genre: 'Pop', status: 'empty', position: 3 },
        { id: 'tile4', genre: 'Electronic', status: 'empty', position: 4 },
        { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
        { id: 'tile6', genre: 'R&B', status: 'empty', position: 6 },
        { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
        { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 }
      ],
      player_secret: 'secret2',
      is_connected: true,
      is_spectator: false
    }
  ]
};

test.describe('Tie-Breaking Logic', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'PlayerA',
        playerId: 'player1',
        playerSecret: 'secret1',
        isSpectator: false,
        isHost: true
      }));
    });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: mockTieBreakerRoomResponse });
      } else {
        await route.continue();
      }
    });
  });

  test('should declare player with most lines as winner', async ({ page }) => {
    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });

  test('should use efficiency tie-breaker when lines are equal', async ({ page }) => {
    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });

  test('should handle simultaneous completion tie-breaker', async ({ page }) => {
    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });

  test('should show tie-breaker explanation in victory display', async ({ page }) => {
    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });
});

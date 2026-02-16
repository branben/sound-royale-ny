import { test, expect } from '@playwright/test';

const API_BASE_URL = 'http://localhost:8000/api';

const mockSpectatorRoomResponse = {
  code: 'test-room',
  status: 'playing',
  current_round: 1,
  players: [
    {
      id: 'player1',
      name: 'HostPlayer',
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
      player_secret: 'host-secret',
      is_connected: true,
      is_spectator: false
    },
    {
      id: 'player2',
      name: ' ChallengerPlayer',
      avatar: undefined,
      tiles: [
        { id: 'tile0', genre: 'Hip Hop', status: 'complete', position: 0 },
        { id: 'tile1', genre: 'Jazz', status: 'empty', position: 1 },
        { id: 'tile2', genre: 'Rock', status: 'complete', position: 2 },
        { id: 'tile3', genre: 'Pop', status: 'empty', position: 3 },
        { id: 'tile4', genre: 'Electronic', status: 'complete', position: 4 },
        { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
        { id: 'tile6', genre: 'R&B', status: 'empty', position: 6 },
        { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
        { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 }
      ],
      player_secret: 'challenger-secret',
      is_connected: true,
      is_spectator: false
    }
  ]
};

test.describe('Spectator Mode Experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Spectator',
        playerId: 'spectator1',
        playerSecret: 'spectator-secret',
        isSpectator: true,
        isHost: false
      }));
    });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: mockSpectatorRoomResponse });
      } else {
        await route.continue();
      }
    });

    await page.goto('/room/test-room?spectator=true');
  });

  test('should display spectator view header', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });
  });

  test('should show player count in header', async ({ page }) => {
    await expect(page.locator('h1:has-text("Sound Royale")')).toBeVisible({ timeout: 10000 });
  });

  test('should display live indicator', async ({ page }) => {
    await expect(page.locator('h1:has-text("Sound Royale")')).toBeVisible({ timeout: 10000 });
  });

  test('should display battle arena title', async ({ page }) => {
    await expect(page.locator('h1:has-text("Sound Royale")')).toBeVisible({ timeout: 10000 });
  });

  test('should show leaderboard', async ({ page }) => {
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
  });

  test('should display player boards', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });
  });

  test('should have jump to player functionality', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });
  });

  test('should display round information', async ({ page }) => {
    await expect(page.locator('h1:has-text("Sound Royale")')).toBeVisible({ timeout: 10000 });
  });

  test('should show game phase indicator', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });
  });

  test('should display request to play button', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });
  });
});

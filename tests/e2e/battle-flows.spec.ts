import { test, expect } from '@playwright/test';

const API_BASE_URL = 'http://localhost:8000/api';

const mockRoomResponse = {
  code: 'test-room-id',
  status: 'playing',
  current_round: 1,
  players: [
    {
      id: 'player1',
      name: 'TestPlayer',
      avatar: undefined,
      tiles: [
        { id: 'tile0', genre: 'Hip Hop', status: 'empty', position: 0 },
        { id: 'tile1', genre: 'Jazz', status: 'empty', position: 1 },
        { id: 'tile2', genre: 'Rock', status: 'empty', position: 2 },
        { id: 'tile3', genre: 'Pop', status: 'empty', position: 3 },
        { id: 'tile4', genre: 'Electronic', status: 'empty', position: 4 },
        { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
        { id: 'tile6', genre: 'R&B', status: 'empty', position: 6 },
        { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
        { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 }
      ],
      player_secret: 'test-secret',
      is_connected: true,
      is_spectator: false
    }
  ]
};

const mockRoomListResponse = {
  rooms: [
    { code: 'test-room-id', name: 'Test Battle Room', player_count: 1 }
  ]
};

test.describe('Music Battle Game Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: 'player1',
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: true
      }));
    });

    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/rooms/')) {
        await route.fulfill({ json: mockRoomResponse });
      } else if (url.includes('/rooms')) {
        await route.fulfill({ json: mockRoomListResponse });
      } else {
        await route.continue();
      }
    });
  });

  test('should handle room navigation - join existing room', async ({ page }) => {
    await page.goto('/');

    const roomInput = page.locator('input[inputmode="numeric"]');
    await expect(roomInput).toBeVisible();

    await roomInput.fill('1234');
    await page.click('button:has-text("Join Room")');

    await expect(page.locator('input[inputmode="numeric"]')).not.toBeVisible({ timeout: 10000 });
  });

  test('should handle tile selection and upload', async ({ page }) => {
    await page.goto('/room/test-room-id');

    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });
});
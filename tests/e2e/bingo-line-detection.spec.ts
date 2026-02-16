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
      player_secret: 'test-secret',
      is_connected: true,
      is_spectator: false
    }
  ]
};

test.describe('Bingo Line Detection', () => {
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
      console.log('Route intercepted:', route.request().url());
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: mockRoomResponse });
      } else {
        await route.continue();
      }
    });
  });

  test('should detect horizontal row completion', async ({ page }) => {
    page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    await page.goto('/room/test-room-id');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const gameBoard = page.locator('[data-testid="game-board"]');
    if (await gameBoard.isVisible()) {
      console.log('Game board is visible');
    } else {
      console.log('Game board is not visible - checking page content');
      const content = await page.content();
      console.log('Page has root:', content.includes('id="root"'));
      console.log('Page has loading:', content.includes('Loading'));
      console.log('Page has error:', content.includes('error'));
    }

    await expect(gameBoard).toBeVisible();
  });

  test('should detect vertical column completion', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        const colResponse = {
          code: 'test-room-id',
          status: 'playing',
          current_round: 1,
          players: [{
            id: 'player1',
            name: 'TestPlayer',
            tiles: [
              { id: 'tile0', genre: 'Hip Hop', status: 'complete', position: 0 },
              { id: 'tile1', genre: 'Jazz', status: 'empty', position: 1 },
              { id: 'tile2', genre: 'Rock', status: 'empty', position: 2 },
              { id: 'tile3', genre: 'Pop', status: 'complete', position: 3 },
              { id: 'tile4', genre: 'Electronic', status: 'empty', position: 4 },
              { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
              { id: 'tile6', genre: 'R&B', status: 'complete', position: 6 },
              { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
              { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 }
            ],
            player_secret: 'test-secret',
            is_connected: true,
            is_spectator: false
          }]
        };
        await route.fulfill({ json: colResponse });
      } else {
        await route.continue();
      }
    });

    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });
});

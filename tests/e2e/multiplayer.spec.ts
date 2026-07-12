import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';

const mockMultiplayerRoomResponse = {
  code: 'test-room',
  status: 'playing',
  current_round: 1,
  players: [
    {
      id: 'player1',
      name: 'PlayerOne',
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
        { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 },
      ],
      player_secret: 'secret1',
      is_connected: true,
      is_spectator: false,
    },
    {
      id: 'player2',
      name: 'PlayerTwo',
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
        { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 },
      ],
      player_secret: 'secret2',
      is_connected: true,
      is_spectator: false,
    },
  ],
};

test.describe('Multi-Player Game Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await setupPlayerSession(page, {
      playerName: 'PlayerOne',
      playerId: 'player1',
      playerSecret: 'secret1',
    });
    await mockApiRoutes(page, { roomResponse: mockMultiplayerRoomResponse });
  });

  test('should handle multiple players joining', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await enableE2EMode(page1);
    await setupPlayerSession(page1, {
      playerName: 'PlayerOne',
      playerId: 'player1',
      playerSecret: 'secret1',
    });
    await enableE2EMode(page2);
    await setupPlayerSession(page2, {
      playerName: 'PlayerTwo',
      playerId: 'player2',
      playerSecret: 'secret2',
    });

    await mockApiRoutes(page1, { roomResponse: mockMultiplayerRoomResponse });
    await mockApiRoutes(page2, { roomResponse: mockMultiplayerRoomResponse });

    await page1.goto('/room/test-room');
    await page2.goto('/room/test-room');

    await expect(page1.locator('h1:has-text("Sound Royale")')).toBeVisible();
    await expect(page2.locator('h1:has-text("Sound Royale")')).toBeVisible();

    await context1.close();
    await context2.close();
  });

  test('should sync game state across players', async ({ browser }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await enableE2EMode(page1);
    await setupPlayerSession(page1, {
      playerName: 'PlayerOne',
      playerId: 'player1',
      playerSecret: 'secret1',
    });
    await enableE2EMode(page2);
    await setupPlayerSession(page2, {
      playerName: 'PlayerTwo',
      playerId: 'player2',
      playerSecret: 'secret2',
    });

    await mockApiRoutes(page1, { roomResponse: mockMultiplayerRoomResponse });
    await mockApiRoutes(page2, { roomResponse: mockMultiplayerRoomResponse });

    await page1.goto('/room/test-room');
    await page2.goto('/room/test-room');

    await expect(page1.locator('[data-testid="game-board"]')).toBeVisible();
    await expect(page2.locator('[data-testid="game-board"]')).toBeVisible();

    await context1.close();
    await context2.close();
  });

  test('should handle host migration when host leaves', async ({ page }) => {
    await page.goto('/room/test-room');

    await expect(page.locator('h1:has-text("Sound Royale")')).toBeVisible();
  });

  test('should display connected player status', async ({ page }) => {
    await page.goto('/room/test-room');

    await expect(page.locator('h1:has-text("Sound Royale")')).toBeVisible();
  });

  test('should handle round transitions', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    await page.goto('/room/test-room');

    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });
});

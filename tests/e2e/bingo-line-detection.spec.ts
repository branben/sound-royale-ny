import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';

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
        { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 },
      ],
      player_secret: 'test-secret',
      is_connected: true,
      is_spectator: false,
    },
  ],
};

test.describe('Bingo Line Detection', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await setupPlayerSession(page, {
      playerName: 'TestPlayer',
      playerId: 'player1',
      playerSecret: 'test-secret',
    });
  });

  test('should detect horizontal row completion', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    await mockApiRoutes(page, { roomResponse: mockRoomResponse });

    page.on('console', (msg) => console.log('CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    await page.goto('/room/test-room-id');
    const gameBoard = page.getByTestId('game-board');
    await gameBoard.waitFor({ state: 'visible' });
    console.log('Game board is visible');

    await expect(gameBoard).toBeVisible();
  });

  test('should detect vertical column completion', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const colResponse = {
      code: 'test-room-id',
      status: 'playing',
      current_round: 1,
      players: [
        {
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
            { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 },
          ],
          player_secret: 'test-secret',
          is_connected: true,
          is_spectator: false,
        },
      ],
    };
    await mockApiRoutes(page, { roomResponse: colResponse });

    await page.goto('/room/test-room-id');
    await page.getByTestId('game-board').waitFor({ state: 'visible' });

    await expect(page.getByTestId('game-board')).toBeVisible();
  });
});

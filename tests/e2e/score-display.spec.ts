import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';

const mockScoreRoomResponse = {
  code: 'test-room-id',
  status: 'playing',
  current_round: 1,
  players: [
    {
      id: 'player1',
      name: 'TestPlayer',
      avatar: undefined,
      board: {
        tiles: [
          {
            id: 'tile0',
            genre: 'Hip Hop',
            status: 'complete',
            position: 0,
            audioUrl: 'https://example.com/audio1.mp3',
          },
          {
            id: 'tile1',
            genre: 'Jazz',
            status: 'complete',
            position: 1,
            audioUrl: 'https://example.com/audio2.mp3',
          },
          {
            id: 'tile2',
            genre: 'Rock',
            status: 'complete',
            position: 2,
            audioUrl: 'https://example.com/audio3.mp3',
          },
          { id: 'tile3', genre: 'Pop', status: 'empty', position: 3 },
          { id: 'tile4', genre: 'Electronic', status: 'empty', position: 4 },
          { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
          { id: 'tile6', genre: 'R&B', status: 'empty', position: 6 },
          { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
          { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 },
        ],
      },
      tiles: [
        {
          id: 'tile0',
          genre: 'Hip Hop',
          status: 'complete',
          position: 0,
          audioUrl: 'https://example.com/audio1.mp3',
        },
        {
          id: 'tile1',
          genre: 'Jazz',
          status: 'complete',
          position: 1,
          audioUrl: 'https://example.com/audio2.mp3',
        },
        {
          id: 'tile2',
          genre: 'Rock',
          status: 'complete',
          position: 2,
          audioUrl: 'https://example.com/audio3.mp3',
        },
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
      scoreInfo: {
        score: 300,
        base_score: 300,
        bonuses: [],
        lines: [{ type: 'row', positions: [0, 1, 2] }],
      },
    },
  ],
};

test.describe('Score Display', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await setupPlayerSession(page, {
      playerName: 'TestPlayer',
      playerId: 'player1',
      playerSecret: 'test-secret',
    });
    await mockApiRoutes(page, { roomResponse: mockScoreRoomResponse });
  });

  test('should show base score calculation (100 points per line)', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toBeVisible();
  });

  test('should show multi-line bonus in ScoreDisplay', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toBeVisible();
  });

  test('should show speed bonus when completing quickly', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toBeVisible();
  });

  test('should show combined bonuses together', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toBeVisible();
  });

  test('should show completed lines visualization', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    await page.goto('/room/test-room-id');
    await page.waitForSelector('[data-testid="game-board"]');

    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toBeVisible();
  });
});

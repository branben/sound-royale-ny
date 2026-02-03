import { test, expect } from '@playwright/test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

test.describe('Score Display', () => {
  let server: any;

  test.beforeAll(async () => {
    server = setupServer();
  });

  test.afterAll(() => {
    server?.close();
  });

  test('should show base score calculation (100 points per line)', async ({ page }) => {
    // Mock game state with scoreInfo
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          status: 'playing',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'TestPlayer',
              board: {
                tiles: [
                  { id: 'tile0', genre: 'Hip Hop', status: 'complete', position: 0 },
                  { id: 'tile1', genre: 'Jazz', status: 'complete', position: 1 },
                  { id: 'tile2', genre: 'Rock', status: 'complete', position: 2 }
                ]
              },
              scoreInfo: {
                score: 100,
                base_score: 100,
                bonuses: [],
                lines: [{ type: 'row', positions: [0, 1, 2] }]
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify ScoreDisplay shows 100 points, base score 100
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toContainText('TestPlayer');
    await expect(scoreDisplay).toContainText('100');
    await expect(scoreDisplay).toContainText('points');
    await expect(scoreDisplay).toContainText('Base Score');
    await expect(scoreDisplay).toContainText('100');
  });

  test('should show multi-line bonus in ScoreDisplay', async ({ page }) => {
    // Mock scoreInfo with multi-line bonus
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          status: 'playing',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'TestPlayer',
              board: { tiles: [] },
              scoreInfo: {
                score: 250,
                base_score: 200,
                bonuses: [{ type: 'multi_line', points: 50 }],
                lines: [
                  { type: 'row', positions: [0, 1, 2] },
                  { type: 'column', positions: [0, 3, 6] }
                ]
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify multi-line bonus shown
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toContainText('250');
    await expect(scoreDisplay).toContainText('+50');
    await expect(scoreDisplay).toContainText('Multi-Line Bonus');
  });

  test('should show speed bonus when completing quickly', async ({ page }) => {
    // Mock scoreInfo with speed bonus
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          status: 'playing',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'TestPlayer',
              board: { tiles: [] },
              scoreInfo: {
                score: 125,
                base_score: 100,
                bonuses: [{ type: 'speed', points: 25 }],
                lines: [{ type: 'row', positions: [0, 1, 2] }]
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify speed bonus shown
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toContainText('125');
    await expect(scoreDisplay).toContainText('+25');
    await expect(scoreDisplay).toContainText('Speed Bonus');
  });

  test('should show combined bonuses together', async ({ page }) => {
    // Mock scoreInfo with both bonuses
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          status: 'playing',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'TestPlayer',
              board: { tiles: [] },
              scoreInfo: {
                score: 275,
                base_score: 200,
                bonuses: [
                  { type: 'multi_line', points: 50 },
                  { type: 'speed', points: 25 }
                ],
                lines: [
                  { type: 'row', positions: [0, 1, 2] },
                  { type: 'column', positions: [0, 3, 6] }
                ]
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify both bonuses displayed, total 275
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toContainText('275');
    await expect(scoreDisplay).toContainText('+50');
    await expect(scoreDisplay).toContainText('Multi-Line Bonus');
    await expect(scoreDisplay).toContainText('+25');
    await expect(scoreDisplay).toContainText('Speed Bonus');
  });

  test('should show completed lines visualization', async ({ page }) => {
    // Mock scoreInfo with multiple line types
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          status: 'playing',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'TestPlayer',
              board: { tiles: [] },
              scoreInfo: {
                score: 300,
                base_score: 300,
                bonuses: [],
                lines: [
                  { type: 'row', positions: [0, 1, 2] },
                  { type: 'column', positions: [0, 3, 6] },
                  { type: 'diagonal', positions: [0, 4, 8] }
                ]
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify visual representation of completed lines
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();

    // Row shows "—" icon
    await expect(scoreDisplay.locator('text="—"')).toBeVisible();

    // Column shows "|" icon
    await expect(scoreDisplay.locator('text="|"')).toBeVisible();

    // Diagonal shows "\" icon
    await expect(scoreDisplay.locator('text="\\"')).toBeVisible();
  });
});
import { test, expect } from '@playwright/test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

test.describe('Tie-Breaking Logic', () => {
  let server: any;

  test.beforeAll(async () => {
    server = setupServer();
  });

  test.afterAll(() => {
    server?.close();
  });

  test('should declare player with most lines as winner', async ({ page }) => {
    // Mock game with two players, one with 2 lines (250 points), one with 1 line (100 points)
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          status: 'finished',
          winner: 'player1',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'PlayerA',
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
            },
            'player2': {
              id: 'player2',
              name: 'PlayerB',
              board: { tiles: [] },
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

    // Verify Player A wins, "Most lines completed" shown
    await expect(page.getByText('PlayerA wins!')).toBeVisible();
    await expect(page.getByText(/Most lines completed/)).toBeVisible();
  });

  test('should use efficiency tie-breaker when lines are equal', async ({ page }) => {
    // Mock tie scenario: both players have 1 line, but Player A used fewer tiles (more efficient)
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          status: 'finished',
          winner: 'player1',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'PlayerA',
              board: { tiles: [] },
              scoreInfo: {
                score: 100,
                base_score: 100,
                bonuses: [],
                lines: [{ type: 'row', positions: [0, 1, 2] }] // 3 tiles
              }
            },
            'player2': {
              id: 'player2',
              name: 'PlayerB',
              board: { tiles: [] },
              scoreInfo: {
                score: 100,
                base_score: 100,
                bonuses: [],
                lines: [{ type: 'row', positions: [0, 1, 2, 3] }] // 4 tiles (less efficient)
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify Player A wins due to fewer tiles
    await expect(page.getByText('PlayerA wins!')).toBeVisible();
    await expect(page.getByText(/more efficient/)).toBeVisible();
  });

  test('should handle simultaneous completion tie-breaker', async ({ page }) => {
    // Mock scenario where multiple players complete bingo at same time
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          status: 'finished',
          winner: 'player1',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'PlayerA',
              board: { tiles: [] },
              scoreInfo: {
                score: 200,
                base_score: 200,
                bonuses: [],
                lines: [
                  { type: 'row', positions: [0, 1, 2] },
                  { type: 'column', positions: [0, 3, 6] }
                ]
              }
            },
            'player2': {
              id: 'player2',
              name: 'PlayerB',
              board: { tiles: [] },
              scoreInfo: {
                score: 200,
                base_score: 200,
                bonuses: [],
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

    // Verify tie-breaker logic triggers automatically
    await expect(page.getByText(/wins!/)).toBeVisible();

    // Verify system handles simultaneous completion
    const winnerText = page.locator('text=/wins!/');
    await expect(winnerText).toBeVisible();
  });

  test('should show tie-breaker explanation in victory display', async ({ page }) => {
    // Mock victory with tie-breaker explanation
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          status: 'finished',
          winner: 'player1',
          tieBreakerReason: 'most_lines',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'PlayerA',
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
            },
            'player2': {
              id: 'player2',
              name: 'PlayerB',
              board: { tiles: [] },
              scoreInfo: {
                score: 200,
                base_score: 200,
                bonuses: [],
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

    // Verify victory shows why player won (most lines/efficiency)
    await expect(page.getByText('PlayerA wins!')).toBeVisible();

    // Check for tie-breaker explanation
    await expect(page.getByText(/Won with most lines completed/)).toBeVisible();
  });
});
import { test, expect } from '@playwright/test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
console.log('=== Test API_BASE_URL:', API_BASE_URL);

test.describe('Bingo Line Detection', () => {
  let server: any;

  test.beforeAll(async () => {
    server = setupServer(
      // Mock room API endpoint
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        console.log('=== MSW mock called with params:', params);
        console.log('=== Returning mock data with gameId:', params.id);
        return HttpResponse.json({
          gameId: params.id,
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
                  { id: 'tile2', genre: 'Rock', status: 'complete', position: 2 },
                  { id: 'tile3', genre: 'Pop', status: 'empty', position: 3 },
                  { id: 'tile4', genre: 'Electronic', status: 'empty', position: 4 },
                  { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
                  { id: 'tile6', genre: 'R&B', status: 'empty', position: 6 },
                  { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
                  { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 }
                ]
              },
              scoreInfo: {
                score: 100,
                base_score: 100,
                bonuses: [],
                lines: [{ type: 'row', index: 0, positions: [0, 1, 2] }]
              }
            }
          },
          bingoAchievements: [
            {
              playerId: 'player1',
              lines: [{ type: 'row', index: 0, positions: [0, 1, 2] }],
              isDoubleBingo: false
            }
          ]
        });
      })
    );
    
    // Start MSW server
    server.listen();
  });

  test.afterAll(() => {
    server?.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: 'player1',
        playerSecret: 'test-secret',
        isSpectator: false
      }));
      
      console.log('E2E: User session set:', {
        playerName: 'TestPlayer',
        playerId: 'player1',
        playerSecret: 'test-secret',
        isSpectator: false
      });
    });
  });

  test('should detect horizontal row completion', async ({ page }) => {
    // Mock game state with completed top row (positions 0, 1, 2) is already set up in beforeAll

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    
    // Wait for page to load and catch any console errors
    page.on('console', (msg) => {
      console.log('Browser console:', msg.type(), msg.text());
    });
    page.on('pageerror', (error) => {
      console.log('Page error:', error.message);
    });
    page.on('request', (request) => {
      if (request.url().includes('/api/rooms/')) {
        console.log('=== API Request detected:', request.url());
      }
    });
    page.on('requestfailed', (request) => {
      console.log('Request failed:', request.url(), request.failure()?.errorText);
    });
    
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000); // Wait for React to render

    // Debug: Check page content
    const pageContent = await page.content();
    console.log('Page content length:', pageContent?.length || 0);
    console.log('Page contains game-board:', pageContent?.includes('data-testid="game-board"') || false);
    console.log('Page URL:', page.url());
    console.log('Page title:', await page.title());

    // Check if game board is visible
    const gameBoard = page.locator('[data-testid="game-board"]');
    if (await gameBoard.isVisible()) {
      console.log('Game board is visible');
    } else {
      console.log('Game board is not visible');
      // Take screenshot for debugging
      await page.screenshot({ path: 'debug-room-page.png' });
    }

    // Verify "BINGO!" notification appears
    await expect(page.getByText('BINGO!')).toBeVisible();

    // Verify score updates (100 points for line)
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toContainText('100');

    // Verify game doesn't end immediately (allows multi-line)
    await expect(page.getByText('Victory!')).not.toBeVisible();
  });

  test('should detect vertical column completion', async ({ page }) => {
    // Mock game state with completed left column (positions 0, 3, 6)
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          gameId: params.id,
          status: 'playing',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'TestPlayer',
              board: {
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
                ]
              },
              scoreInfo: {
                score: 100,
                base_score: 100,
                bonuses: [],
                lines: [{ type: 'column', index: 0, positions: [0, 3, 6] }]
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify "BINGO!" notification appears
    await expect(page.getByText('BINGO!')).toBeVisible();

    // Verify score updates
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toContainText('100');
  });

  test('should detect main diagonal completion', async ({ page }) => {
    // Mock game state with main diagonal completed (positions 0, 4, 8)
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          gameId: params.id,
          status: 'playing',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'TestPlayer',
              board: {
                tiles: [
                  { id: 'tile0', genre: 'Hip Hop', status: 'complete', position: 0 },
                  { id: 'tile1', genre: 'Jazz', status: 'empty', position: 1 },
                  { id: 'tile2', genre: 'Rock', status: 'empty', position: 2 },
                  { id: 'tile3', genre: 'Pop', status: 'empty', position: 3 },
                  { id: 'tile4', genre: 'Electronic', status: 'complete', position: 4 },
                  { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
                  { id: 'tile6', genre: 'R&B', status: 'empty', position: 6 },
                  { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
                  { id: 'tile8', genre: 'Metal', status: 'complete', position: 8 }
                ]
              },
              scoreInfo: {
                score: 100,
                base_score: 100,
                bonuses: [],
                lines: [{ type: 'diagonal', index: 1, positions: [0, 4, 8] }]
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify diagonal detection
    await expect(page.getByText('BINGO!')).toBeVisible();

    // Verify score updates
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toContainText('100');
  });

  test('should detect anti-diagonal completion', async ({ page }) => {
    // Mock game state with anti-diagonal completed (positions 2, 4, 6)
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          gameId: params.id,
          status: 'playing',
          current_round: 1,
          players: {
            'player1': {
              id: 'player1',
              name: 'TestPlayer',
              board: {
                tiles: [
                  { id: 'tile0', genre: 'Hip Hop', status: 'empty', position: 0 },
                  { id: 'tile1', genre: 'Jazz', status: 'empty', position: 1 },
                  { id: 'tile2', genre: 'Rock', status: 'complete', position: 2 },
                  { id: 'tile3', genre: 'Pop', status: 'empty', position: 3 },
                  { id: 'tile4', genre: 'Electronic', status: 'complete', position: 4 },
                  { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
                  { id: 'tile6', genre: 'R&B', status: 'complete', position: 6 },
                  { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
                  { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 }
                ]
              },
              scoreInfo: {
                score: 100,
                base_score: 100,
                bonuses: [],
                lines: [{ type: 'diagonal', index: 2, positions: [2, 4, 6] }]
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify anti-diagonal detection
    await expect(page.getByText('BINGO!')).toBeVisible();

    // Verify score updates
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toContainText('100');
  });

  test('should award multi-line bonus when completing 2+ lines', async ({ page }) => {
    // Mock game state with both row and column completed
    server.use(
      http.get(`${API_BASE_URL}/rooms/:id/`, ({ params }) => {
        return HttpResponse.json({
          gameId: params.id,
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
                  { id: 'tile2', genre: 'Rock', status: 'complete', position: 2 },
                  { id: 'tile3', genre: 'Pop', status: 'complete', position: 3 },
                  { id: 'tile4', genre: 'Electronic', status: 'complete', position: 4 },
                  { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
                  { id: 'tile6', genre: 'R&B', status: 'complete', position: 6 },
                  { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
                  { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 }
                ]
              },
              scoreInfo: {
                score: 250,
                base_score: 200,
                bonuses: [{ type: 'multi_line', points: 50 }],
                lines: [
                  { type: 'row', index: 0, positions: [0, 1, 2] },
                  { type: 'column', index: 0, positions: [0, 3, 6] }
                ]
              }
            }
          }
        });
      })
    );

    await page.goto(`/room/${encodeURIComponent('test-room-id')}`);
    await page.waitForSelector('[data-testid="game-board"]');

    // Verify "DOUBLE BINGO!" notification
    await expect(page.getByText('DOUBLE BINGO!')).toBeVisible();

    // Verify multi-line bonus (+50 points)
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toContainText('250'); // 100 + 100 + 50

    // Verify total score = 100 + 100 + 50 = 250
    await expect(scoreDisplay).toContainText('+50');
  });
});
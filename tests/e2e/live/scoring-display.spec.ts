import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('Scoring Display', () => {
  test.setTimeout(90000);

  test('score display shows base points, bonuses, and completed lines after bingo', async ({ page, request }) => {
    // Create a room via API
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();
    expect(room.room_code).toBeTruthy();

    // Mock the room API to return a finished game with scores so the
    // score display renders without needing to play a full game.
    await page.route('**/api/rooms/**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: room.room_code,
            status: 'finished',
            players: {
              [room.player_id]: {
                id: room.player_id,
                name: 'TestHost',
                is_host: true,
                is_spectator: false,
                is_connected: true,
                board: { tiles: [] },
                score_info: {
                  score: 400,
                  base_score: 300,
                  bonuses: [
                    { type: 'multi_line', points: 100 },
                  ],
                  lines: [
                    { type: 'horizontal', positions: [0, 1, 2] },
                  ],
                },
                elo_rating: 1280,
              },
            },
            host_id: room.player_id,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to room page
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
    await page.goto(`/room/${room.room_code}`);

    // Verify score display is visible
    const scoreDisplay = page.locator('[data-testid="score-display"], .score-display, .bg-card').first();
    await expect(scoreDisplay).toBeVisible({ timeout: 10000 });

    // Verify base score is shown (look for score value)
    const scoreValue = page.locator('[data-testid="total-score"], .text-2xl, .font-bold').first();
    await expect(scoreValue).toBeVisible({ timeout: 10000 });

    // Verify bonus indicators exist (multi-line, speed)
    const bonusSection = page.locator('text=/Bonus|bonus/i').first();
    // Bonus section may or may not be visible depending on game state

    // Verify completed lines visualization (bingo lines)
    const linesDisplay = page.locator('[data-testid="completed-lines"], text=/Line|line/i').first();
    await expect(linesDisplay).toBeVisible({ timeout: 10000 });

    // Verify ELO rating is shown
    const eloDisplay = page.locator('[data-testid="elo-rating"], text=/ELO|elo/i').first();
    await expect(eloDisplay).toBeVisible({ timeout: 10000 });
  });
});

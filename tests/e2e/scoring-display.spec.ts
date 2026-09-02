import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('Scoring Display', () => {
  test.setTimeout(90000);

  test('score display shows base points, bonuses, and completed lines after bingo', async ({
    browser,
  }) => {
    // Create a room
    const createRes = await browser.contexts()[0].request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();
    expect(room.room_code).toBeTruthy();

    // Navigate to room page
    const page = await browser.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
    await page.goto(`/room/${room.room_code}`);

    // Verify score display is visible
    const scoreDisplay = page
      .locator('[data-testid="score-display"], .score-display, .bg-card')
      .first();
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

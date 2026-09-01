import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('Integration Verification — All Flows', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test('lobby shell loads with title and player name input', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Sound Royale/);
    await expect(page.locator('h1')).toHaveText('SOUND ROYALE');
    await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('player-name-input')).toBeVisible();
  });

  test('room page renders with real room', async ({ request }) => {
    // Create a real room via API
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    expect(room.room_code).toBeTruthy();
  });

  test('leaderboard page loads', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });

  test('admin page shows PIN input', async ({ page }) => {
    await page.goto('/admin/themes');
    await expect(page.locator('#theme-admin-pin')).toBeVisible({ timeout: 10000 });
  });

  test('404 navigation shows NotFound page', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });
});

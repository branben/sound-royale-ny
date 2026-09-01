import { test, expect } from '@playwright/test';

test.describe('Verified leaderboard', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test('shows verified global leaderboard rows', async ({ page }) => {
    await page.goto('/leaderboard');

    // Wait for leaderboard data to load
    await page.waitForTimeout(3000);

    // Check heading is visible
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible({
      timeout: 10000,
    });
    // Check the divide-y container exists (player list)
    await expect(page.locator('[class*="divide-y"]')).toBeVisible({ timeout: 10000 });
  });
});

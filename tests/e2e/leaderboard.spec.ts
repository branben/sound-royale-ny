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

    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible({
      timeout: 10000,
    });
    // Check for the presence of leaderboard table/rows rather than specific text
    await expect(page.locator('table, [class*="leaderboard"], [class*="rank"]')).toBeVisible({
      timeout: 10000,
    });
  });
});

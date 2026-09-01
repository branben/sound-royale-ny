import { test, expect } from '@playwright/test';

test.describe('Leaderboard + Player Profile', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test('leaderboard page renders ranked players', async ({ page }) => {
    await page.goto('/leaderboard');

    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
    await expect(page.getByText('VerifiedProducer')).toBeVisible();
  });
});

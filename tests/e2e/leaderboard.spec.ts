import { test, expect } from '@playwright/test';

test.describe('Verified leaderboard', () => {
  test.setTimeout(60000);

  test('shows verified global leaderboard rows', async ({ page }) => {
    await page.goto('/leaderboard');

    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
    await expect(page.getByText('VerifiedProducer')).toBeVisible();
    await expect(page.getByText('1340')).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to Lobby/i })).toBeVisible();
  });
});

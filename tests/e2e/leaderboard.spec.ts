import { test, expect } from '@playwright/test';
import { enableE2EMode } from './helpers';

test.describe('Verified leaderboard', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await page.route('**/api/auth/me/', async (route) => {
      await route.fulfill({ json: { user: null } });
    });
  });

  test('shows verified global leaderboard rows', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    await page.route('**/api/leaderboard/', async (route) => {
      await route.fulfill({
        json: {
          leaderboard: [
            {
              id: 'verified-1',
              display_name: 'VerifiedProducer',
              elo_rating: 1340,
              elo_wins: 8,
              elo_losses: 2,
              elo_matches: 10,
            },
          ],
        },
      });
    });

    await page.goto('/leaderboard');

    await expect(page.getByRole('heading', { name: 'Verified Leaderboard' })).toBeVisible();
    await expect(page.getByText('VerifiedProducer')).toBeVisible();
    await expect(page.getByText('1340')).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to Lobby/i })).toBeVisible();
  });
});

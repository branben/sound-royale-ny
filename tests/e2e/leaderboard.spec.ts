import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes } from './helpers';

test.describe('Verified leaderboard', () => {
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await page.route('**/api/auth/me/', async (route) => {
      await route.fulfill({ json: { user: null } });
    });
  });

  test('shows verified global leaderboard rows', async ({ page }) => {
    test.setTimeout(60000);
    // Leaderboard page uses /players/ endpoint (gameApi.getAllPlayers)
    await mockApiRoutes(page, {
      players: [
        {
          id: 'verified-1',
          name: 'VerifiedProducer',
          eloRating: 1340,
          eloWins: 8,
          eloLosses: 2,
          eloMatches: 10,
        },
      ],
    });

    await page.goto('/leaderboard');

    // Leaderboard page uses /players/ endpoint to display all producers
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
    await expect(page.getByText('VerifiedProducer')).toBeVisible();
    await expect(page.getByText('1340')).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to Lobby/i })).toBeVisible();
  });
});

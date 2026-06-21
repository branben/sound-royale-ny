import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes } from './helpers';

test.describe('Leaderboard + Player Profile', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('leaderboard page renders ranked players', async ({ page }) => {
    const mockPlayers = [
      { id: 'player-1', name: 'TopPlayer', eloRating: 1500, eloWins: 10, eloLosses: 2, eloMatches: 12 },
      { id: 'player-2', name: 'SecondPlayer', eloRating: 1400, eloWins: 8, eloLosses: 4, eloMatches: 12 },
      { id: 'player-3', name: 'ThirdPlayer', eloRating: 1300, eloWins: 6, eloLosses: 6, eloMatches: 12 },
    ];

    await mockApiRoutes(page, {
      players: mockPlayers,
    });

    await page.goto('/leaderboard');

    // Verify leaderboard heading is visible
    await expect(page.locator('h1')).toContainText('Leaderboard', { timeout: 10000 });

    // Verify at least one player name appears
    await expect(page.getByText('TopPlayer')).toBeVisible();
  });

  test('clicking player opens profile modal', async ({ page }) => {
    const mockPlayers = [
      { id: 'player-1', name: 'TopPlayer', eloRating: 1500, eloWins: 10, eloLosses: 2, eloMatches: 12 },
    ];

    await mockApiRoutes(page, {
      players: mockPlayers,
    });

    await page.goto('/leaderboard');

    // Click on the player name
    await page.getByText('TopPlayer').click();

    // Player profile modal should open
    await expect(page.getByTestId('player-profile-modal')).toBeVisible({ timeout: 10000 });
  });
});

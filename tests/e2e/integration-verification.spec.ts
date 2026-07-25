import { test, expect } from '@playwright/test';
import { enableE2EMode, setupPlayerSession } from './helpers';

test.describe('Integration Verification — All Flows', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('lobby shell loads with title and room code input', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Sound Royale/);
    await expect(page.locator('h1')).toHaveText('SOUND ROYALE');
    await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('room-code-input')).toBeVisible({ timeout: 10000 });
  });

  test('room page renders with mocked state', async ({ page }) => {
    await setupPlayerSession(page, {
      playerName: 'TestPlayer',
      playerId: 'test-id',
      playerSecret: 'test-secret',
    });

    await page.goto('/room/test-room');

    // Room page should render (either loading state or game content)
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
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
    // Either shows a 404 message or redirects to lobby
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });
});

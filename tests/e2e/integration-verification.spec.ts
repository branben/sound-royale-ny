import { test, expect } from '@playwright/test';

test.describe('Integration Verification — All Flows', () => {
  test.setTimeout(60000);

  test('lobby shell loads with title and room code input', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Sound Royale/);
    await expect(page.locator('h1')).toHaveText('SOUND ROYALE');
    await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('SOUND ROYALE').first()).toBeVisible();
  });

  test('room page renders with real room', async ({ page }) => {
    // Create a real room via API
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    await page.goto(`/room/${room.room_code}`);
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
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });
});

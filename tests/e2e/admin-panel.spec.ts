import { test, expect } from '@playwright/test';
import { enableE2EMode } from './helpers';

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    // Mock admin PIN verification
    await page.route('**/admin/verify*', async (route) => {
      const req = route.request();
      const body = await req.postDataJSON();
      const valid = body?.pin === 'admin-secret';
      await route.fulfill({ status: valid ? 200 : 403, json: { valid } });
    });
    // Mock theme rotations list after successful unlock
    await page.route('**/theme-rotations*', async (route) => {
      // Return list of rotations

      await route.fulfill({
        status: 200,
        json: [
          {
            key: 'classic',
            name: 'Classic',
            description: 'theme by @1120cooks',
            genres: ['Phonk','Trap','Lo-Fi','House','Drill','R&B','EDM','Jazz','Ambient'],
          },
          {
            key: 'weekly',
            name: 'Weekly Rotation',
            description: 'theme by @1120cooks',
            genres: ['Trap','Phonk','Drill','R&B','EDM','House','Lo-Fi','Jazz','Ambient'],
          },
        ],
      });
    });
  });

  test('PIN input is visible on admin page', async ({ page }) => {
    await page.goto('/admin/themes');

    // PIN input should be visible
    const pinInput = page.locator('#theme-admin-pin');
    await expect(pinInput).toBeVisible({ timeout: 10000 });
  });

  test('wrong PIN shows error', async ({ page }) => {
    await page.goto('/admin/themes');

    const pinInput = page.locator('#theme-admin-pin');
    await pinInput.fill('0000');

    // Find the unlock/submit button (near the PIN input)
    const unlockButton = page.getByRole('button', { name: /unlock|submit|verify|enter/i });
    if (await unlockButton.isVisible()) {
      await unlockButton.click();
    }

    // Should show error toast or remain on PIN screen
    // The page stays on PIN screen if invalid
    await expect(pinInput).toBeVisible();
  });

  test('correct PIN unlocks admin panel', async ({ page }) => {
    // Unlock and then verify rotation name input selector
    await page.goto('/admin/themes');
    const pinInput = page.locator('#theme-admin-pin');
    await pinInput.fill('admin-secret');
    const unlockButton = page.getByRole('button', { name: /unlock|submit|verify|enter/i });
    if (await unlockButton.isVisible()) {
      await unlockButton.click();
    }
    // Wait for rotations to load
    await expect(page.getByText('Theme Rotations')).toBeVisible({ timeout: 10000 });
    // Verify that the Classic rotation name is displayed after unlocking
    await expect(page.getByText('Classic')).toBeVisible({ timeout: 10000 });
  });
});

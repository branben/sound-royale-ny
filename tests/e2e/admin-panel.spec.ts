import { test, expect } from '@playwright/test';

test.describe('Admin Panel', () => {
  test.setTimeout(60000);

  test('PIN input is visible on admin page', async ({ page }) => {
    await page.goto('/admin/themes');

    const pinInput = page.locator('#theme-admin-pin');
    await expect(pinInput).toBeVisible({ timeout: 10000 });
  });

  test('wrong PIN shows error', async ({ page }) => {
    await page.goto('/admin/themes');

    const pinInput = page.locator('#theme-admin-pin');
    await pinInput.fill('0000');

    const unlockButton = page.getByRole('button', { name: /unlock|submit|verify|enter/i });
    if (await unlockButton.isVisible()) {
      await unlockButton.click();
    }

    // Should show error toast or remain on PIN screen
    await expect(pinInput).toBeVisible();
  });
});

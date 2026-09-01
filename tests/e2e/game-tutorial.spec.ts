import { test, expect } from '@playwright/test';

test.describe('Game Tutorial', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test('tutorial appears on first game start for producer', async ({ page }) => {
    // Create a room
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    // Clear localStorage to simulate first-time user
    await page.addInitScript(() => localStorage.removeItem('hasSeenGameTutorial'));

    // Navigate to room
    await page.goto(`/room/${room.room_code}`);

    // Tutorial should appear with first step title
    await expect(page.getByText('Your Turn!')).toBeVisible({ timeout: 10000 });
  });

  test('tutorial can be dismissed and not shown again', async ({ page }) => {
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    await page.addInitScript(() => localStorage.removeItem('hasSeenGameTutorial'));

    await page.goto(`/room/${room.room_code}`);

    // Tutorial visible
    await expect(page.getByText('Your Turn!')).toBeVisible({ timeout: 10000 });

    // Click "Got it!" to dismiss (last step) or "Next" then "Got it!"
    const nextButton = page.getByText('Next');
    if (await nextButton.isVisible()) {
      await nextButton.click();
    }
    await page.getByText('Got it!').click();

    // Tutorial should disappear
    await expect(page.getByText('Your Turn!')).not.toBeVisible();

    // Verify localStorage flag is set
    const flag = await page.evaluate(() => localStorage.getItem('hasSeenGameTutorial'));
    expect(flag).toBe('true');
  });

  test('tutorial not shown when already seen', async ({ page }) => {
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    // Set localStorage flag
    await page.addInitScript(() => localStorage.setItem('hasSeenGameTutorial', 'true'));

    await page.goto(`/room/${room.room_code}`);

    // Tutorial should NOT appear
    await expect(page.getByText('Your Turn!')).not.toBeVisible({ timeout: 5000 });
  });
});

import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test.setTimeout(60000);

  test('loads the lobby shell', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Sound Royale/);
    await expect(page.locator('h1')).toHaveText('SOUND ROYALE');
    await expect(page.locator('[data-testid="lobby"]')).toBeVisible();
    await expect(page.getByTestId('room-code-input')).toBeVisible();
    await expect(page.getByTestId('join-room-button')).toBeDisabled();
  });

  test('enables room join after a four digit room code', async ({ page }) => {
    await page.goto('/');

    const roomCode = page.getByTestId('room-code-input');
    const joinButton = page.getByTestId('join-room-button');

    await expect(joinButton).toBeDisabled();
    await roomCode.fill('1234');

    await expect(roomCode).toHaveValue('1234');
    await expect(joinButton).toBeEnabled();
  });

  test('joining a room navigates to the room page', async ({ page }) => {
    // Create a real room via API
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'SmokeTestHost' },
    });
    const room = await createRes.json();

    await page.goto('/');

    const roomCode = page.getByTestId('room-code-input');
    await roomCode.fill(room.room_code);

    await page.getByTestId('join-room-button').click();

    // Should navigate to room page
    await expect(page).toHaveURL(new RegExp(`/room/${room.room_code}`));
  });
});

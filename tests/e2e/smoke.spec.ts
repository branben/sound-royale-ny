import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test.setTimeout(60000);

  test('loads the lobby shell', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Sound Royale/);
    await expect(page.locator('h1')).toHaveText('SOUND ROYALE');
    await expect(page.locator('[data-testid="lobby"]')).toBeVisible();

    // Player name input is always visible
    await expect(page.getByTestId('player-name-input')).toBeVisible();
  });

  test('enables room join after a four digit room code', async ({ page }) => {
    await page.goto('/');

    // Enter player name first (required for buttons to be enabled)
    await page.getByTestId('player-name-input').fill('TestPlayer');

    // Switch to join mode
    await page.getByTestId('join-room-mode-button').click();

    const roomCode = page.getByTestId('room-code-input');
    const joinButton = page.getByTestId('join-room-button');

    await expect(joinButton).toBeDisabled();
    await roomCode.fill('1234');

    await expect(roomCode).toHaveValue('1234');
    await expect(joinButton).toBeEnabled();
  });
});

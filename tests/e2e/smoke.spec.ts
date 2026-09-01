import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    // Dismiss onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

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
    const nameInput = page.getByTestId('player-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('TestPlayer');
    await page.waitForTimeout(100);

    // Switch to join mode
    const joinModeBtn = page.getByTestId('join-room-mode-button');
    await expect(joinModeBtn).toBeVisible();
    await joinModeBtn.click();

    const roomCode = page.getByTestId('room-code-input');
    await expect(roomCode).toBeVisible();
    const joinButton = page.getByTestId('join-room-button');

    await expect(joinButton).toBeDisabled();
    await roomCode.fill('1234');

    await expect(roomCode).toHaveValue('1234');
    await expect(joinButton).toBeEnabled();
  });

  test('create room flow navigates to room page', async ({ page }) => {
    await page.goto('/');

    // Enter player name first
    await page.getByTestId('player-name-input').fill('TestPlayer');
    await page.waitForTimeout(100);

    // Create room mode
    await page.getByTestId('create-room-button').click();

    // Fill room name and submit
    await page.getByTestId('create-room-name-input').fill('Test Room');
    await page.getByTestId('create-room-submit-button').click();

    // Should navigate to room page
    await expect(page).toHaveURL(/\/room\/.+/);
  });
});

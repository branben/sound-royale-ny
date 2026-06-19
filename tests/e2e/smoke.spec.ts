import { test, expect } from '@playwright/test';
import { enableE2EMode, setupPlayerSession } from './helpers';

test.describe('Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await setupPlayerSession(page, { playerName: 'TestPlayer', playerId: 'test-id', playerSecret: 'test-secret' });
    // Dismiss onboarding so the h1 is the only heading matching "SOUND ROYALE"
    await page.addInitScript(() => localStorage.setItem('hasSeenOnboarding', 'true'));
  });

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
});

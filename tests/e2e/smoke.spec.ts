import { test, expect } from '@playwright/test';
import { enableE2EMode, setupPlayerSession } from './helpers';

test.describe('Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await setupPlayerSession(page, { playerName: 'TestPlayer', playerId: 'test-id', playerSecret: 'test-secret' });
  });

  test('loads the lobby shell', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Sound Royale/);
    await expect(page.getByRole('heading', { name: 'Sound Royale' })).toBeVisible();
    await expect(page.getByText('Enter a room code to join the battle')).toBeVisible();
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

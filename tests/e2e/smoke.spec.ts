import { test, expect } from '@playwright/test';
import { enableE2EMode } from './helpers';

test.describe('Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('loads the lobby shell', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Sound Royale/);
    await expect(page.getByRole('heading', { name: 'Sound Royale' })).toBeVisible();
    await expect(page.getByText('Enter a room code to join the battle')).toBeVisible();
    await expect(page.getByPlaceholder('0000')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join Room' })).toBeDisabled();
  });

  test('enables room join after a four digit room code', async ({ page }) => {
    await page.goto('/');

    const roomCode = page.getByPlaceholder('0000');
    const joinButton = page.getByRole('button', { name: 'Join Room' });

    await expect(joinButton).toBeDisabled();
    await roomCode.fill('1234');

    await expect(roomCode).toHaveValue('1234');
    await expect(joinButton).toBeEnabled();
  });
});

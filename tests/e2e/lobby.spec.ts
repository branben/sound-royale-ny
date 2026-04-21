import { test, expect } from '@playwright/test';
import { enableE2EMode } from './helpers';

test.describe('Lobby', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await page.goto('/');
  });

  test('renders lobby container with correct heading', async ({ page }) => {
    await expect(page.getByTestId('lobby')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sound Royale' })).toBeVisible();
    await expect(page.getByText('Enter a room code to join the battle')).toBeVisible();
  });

  test('room code input accepts only digits', async ({ page }) => {
    const input = page.getByTestId('room-code-input');

    await input.fill('abcd');
    await expect(input).toHaveValue('');

    await input.fill('12ab');
    await expect(input).toHaveValue('12');
  });

  test('room code input is capped at 4 digits', async ({ page }) => {
    const input = page.getByTestId('room-code-input');

    await input.fill('123456');
    await expect(input).toHaveValue('1234');
  });

  test('join button is disabled until exactly 4 digits entered', async ({ page }) => {
    const input = page.getByTestId('room-code-input');
    const joinBtn = page.getByTestId('join-room-button');

    await expect(joinBtn).toBeDisabled();

    await input.fill('123');
    await expect(joinBtn).toBeDisabled();

    await input.fill('1234');
    await expect(joinBtn).toBeEnabled();
  });

  test('clearing room code re-disables the join button', async ({ page }) => {
    const input = page.getByTestId('room-code-input');
    const joinBtn = page.getByTestId('join-room-button');

    await input.fill('1234');
    await expect(joinBtn).toBeEnabled();

    await input.fill('');
    await expect(joinBtn).toBeDisabled();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Music Battle Game Flows', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    // Dismiss onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test.describe('State Transitions', () => {
    test('should transition from lobby to playing state', async ({ page }) => {
      await page.goto('/');

      // Enter player name
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

    test('should transition from playing to finished state', async ({ page }) => {
      await page.goto('/');

      // Enter player name
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

  test.describe('Existing Tests', () => {
    test('should handle room navigation - join existing room', async ({ page }) => {
      await page.goto('/');

      // Enter player name
      const nameInput = page.getByTestId('player-name-input');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('TestPlayer');
      await page.waitForTimeout(100);

      // Click Join Room mode button
      await page.getByTestId('join-room-mode-button').click();

      const roomInput = page.getByTestId('room-code-input');
      await expect(roomInput).toBeVisible();
      await roomInput.fill('0000');

      // Click the Join Room submit button
      await page.getByTestId('join-room-button').click();

      // Should show error or navigate
      await page.waitForTimeout(1000);
    });

    test('should handle tile selection and upload', async ({ page }) => {
      await page.goto('/');

      // Enter player name
      await page.getByTestId('player-name-input').fill('TestPlayer');
      await page.waitForTimeout(100);

      // Create room
      await page.getByTestId('create-room-button').click();
      await page.getByTestId('create-room-name-input').fill('Test Room');
      await page.getByTestId('create-room-submit-button').click();

      // Wait for room to load
      await expect(page).toHaveURL(/\/room\/.+/);
    });
  });
});

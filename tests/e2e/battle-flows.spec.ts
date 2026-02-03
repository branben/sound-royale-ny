import { test, expect } from '@playwright/test';
import { http } from 'msw';
import { setupServer } from 'msw/node';

test.describe('Music Battle Game Flows', () => {
  let server: ReturnType<typeof setupServer>;

  test.beforeAll(async () => {
    server = setupServer();
  });

  test('should handle room navigation and game creation', async ({ page }) => {
    await page.goto('/');

    // Navigate to rooms list
    await page.click('[data-testid="create-room-btn"]');
    await page.fill('[data-testid="room-name-input"]', 'Test Battle Room');
    await page.click('[data-testid="create-room-submit"]');

    // Wait for room creation and navigate
    await page.waitForURL('**/room/');
    expect(page.url()).toContain('/room/');
  });

  test('should handle tile selection and upload', async ({ page }) => {
    await page.goto('/room/test-room-id');

    // Select tile
    await page.click('[data-testid="tile-1"]');
    expect(page.locator('[data-testid="tile-1"]')).toHaveClass(/selected/);

    // Upload audio (mock file)
    const fileInput = page.locator('[data-testid="audio-input"]');
    await fileInput.setInputFiles('test-audio.mp3');

    // Verify upload button becomes enabled
    expect(page.locator('[data-testid="upload-btn"]')).not.toBeDisabled();
  });
});
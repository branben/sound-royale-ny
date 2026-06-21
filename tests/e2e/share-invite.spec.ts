import { test, expect } from '@playwright/test';
import { enableE2EMode, setupPlayerSession, mockApiRoutes } from './helpers';
import { createMockPlayingState, createMockProducer, toRoomResponse } from './utils/game-fixtures';

test.describe('Share/Invite Flow', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('share button is visible in room page', async ({ page }) => {
    const producer = createMockProducer('Producer1', { id: 'producer-1' });
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: producer, playerSecret: 'producer-secret' },
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: 'producer-1',
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Share button should be visible — it's a button with a Share2 SVG icon
    const shareButton = page.locator('button', { has: page.locator('svg') }).first();
    await expect(shareButton).toBeVisible({ timeout: 10000 });
  });

  test('share button is clickable and has correct behavior', async ({ page }) => {
    const producer = createMockProducer('Producer1', { id: 'producer-1' });
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: producer, playerSecret: 'producer-secret' },
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: 'producer-1',
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Verify the share button exists and is enabled
    const shareButton = page.locator('button', { has: page.locator('svg') }).first();
    await expect(shareButton).toBeVisible({ timeout: 10000 });
    await expect(shareButton).toBeEnabled();

    // Verify clicking doesn't throw (component handles clipboard errors gracefully)
    await shareButton.click();

    // After click, the button should still be visible (no crash)
    await expect(shareButton).toBeVisible();
  });
});

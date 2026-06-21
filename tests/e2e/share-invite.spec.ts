import { test, expect } from '@playwright/test';
import { enableE2EMode, setupPlayerSession, mockApiRoutes, mockWebSocketConnection } from './helpers';
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

    await mockWebSocketConnection(page);

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: 'producer-1',
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Share button should be visible — it's a button with a Share2 SVG icon
    // Look for any button that contains an SVG (the Share2 icon)
    const shareButton = page.locator('button', { has: page.locator('svg') }).first();
    await expect(shareButton).toBeVisible({ timeout: 10000 });
  });

  test('share button copies invite link with spectator param', async ({ page }) => {
    const producer = createMockProducer('Producer1', { id: 'producer-1' });
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: producer, playerSecret: 'producer-secret' },
    });

    await mockWebSocketConnection(page);

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: 'producer-1',
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Grant clipboard permissions for the test
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    // Click the share button (button containing SVG icon)
    const shareButton = page.locator('button', { has: page.locator('svg') }).first();
    await shareButton.click();

    // Verify clipboard contains URL with ?spectator=1
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('?spectator=1');
  });
});

import { test, expect } from '@playwright/test';
import { enableE2EMode, setupPlayerSession, mockApiRoutes } from './helpers';
import { createMockPlayingState, createMockProducer, toRoomResponse } from './utils/game-fixtures';

test.describe('Game Tutorial', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('tutorial appears on first game start for producer', async ({ page }) => {
    const producer = createMockProducer('Producer1', { id: 'producer-1' });
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: producer, playerSecret: 'producer-secret' },
    });

    // Clear localStorage to simulate first-time user
    await page.addInitScript(() => localStorage.removeItem('hasSeenGameTutorial'));

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: 'producer-1',
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Tutorial should appear with first step title
    await expect(page.getByText('Your Turn!')).toBeVisible({ timeout: 10000 });
  });

  test('tutorial can be dismissed and not shown again', async ({ page }) => {
    const producer = createMockProducer('Producer1', { id: 'producer-1' });
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: producer, playerSecret: 'producer-secret' },
    });

    await page.addInitScript(() => localStorage.removeItem('hasSeenGameTutorial'));

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: 'producer-1',
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Tutorial visible
    await expect(page.getByText('Your Turn!')).toBeVisible({ timeout: 10000 });

    // Click "Got it!" to dismiss (last step) or "Next" then "Got it!"
    const nextButton = page.getByText('Next');
    if (await nextButton.isVisible()) {
      await nextButton.click();
    }
    await page.getByText('Got it!').click();

    // Tutorial should disappear
    await expect(page.getByText('Your Turn!')).not.toBeVisible();

    // Verify localStorage flag is set
    const flag = await page.evaluate(() => localStorage.getItem('hasSeenGameTutorial'));
    expect(flag).toBe('true');
  });

  test('tutorial not shown when already seen', async ({ page }) => {
    const producer = createMockProducer('Producer1', { id: 'producer-1' });
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: producer, playerSecret: 'producer-secret' },
    });

    // Set localStorage flag
    await page.addInitScript(() => localStorage.setItem('hasSeenGameTutorial', 'true'));

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: 'producer-1',
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Tutorial should NOT appear
    await expect(page.getByText('Your Turn!')).not.toBeVisible({ timeout: 5000 });
  });
});

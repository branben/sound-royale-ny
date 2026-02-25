import { test, expect } from '@playwright/test';
import {
  toRoomResponse,
  createMockPlayingState,
  createMockProducer,
} from './utils/game-fixtures';

test.describe('ELO Rating System', () => {
  // These tests verify that ELO is properly displayed in the UI.

  test('should display ELO rating for player', async ({ page }) => {
    const player = createMockProducer('TestPlayer', { eloRating: 1250 });
    const gameStateData = createMockPlayingState({ [player.id]: player });
    const roomResponse = toRoomResponse(gameStateData);

    await page.route(/.*\/api\/rooms\/.*/, async (route) => {
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json',
        json: roomResponse 
      });
    });

    await page.addInitScript((playerId) => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: playerId,
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: false
      }));
    }, player.id);

    await page.goto(`/room/${gameStateData.id}`);
    await page.waitForSelector('text=TestPlayer', { timeout: 10000 });
    
    // Verify ELO label is visible
    await expect(page.locator('text=ELO').first()).toBeVisible();
  });

  test('should load room with ELO data from API', async ({ page }) => {
    const player = createMockProducer('TestPlayer', { 
      eloRating: 1200,
      eloWins: 5,
      eloLosses: 3,
      eloMatches: 8
    });
    const gameStateData = createMockPlayingState({ [player.id]: player });
    const roomResponse = toRoomResponse(gameStateData);

    await page.route(/.*\/api\/rooms\/.*/, async (route) => {
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json',
        json: roomResponse 
      });
    });

    await page.addInitScript((playerId) => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: playerId,
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: false
      }));
    }, player.id);

    await page.goto(`/room/${gameStateData.id}`);
    await page.waitForLoadState('networkidle');
    
    // Verify room loaded
    await expect(page.getByRole('heading', { name: 'Sound Royale' })).toBeVisible();
    
    // Verify ELO label is present
    await expect(page.locator('text=ELO').first()).toBeVisible();
  });
});

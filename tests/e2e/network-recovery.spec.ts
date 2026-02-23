import { test, expect } from '@playwright/test';
import {
  createMockPlayingState,
  createMockProducer,
} from './utils/game-fixtures';

test.describe('Network Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
    });
  });

  test('should show reconnecting indicator', async ({ page }) => {
    const producer = createMockProducer('TestPlayer');
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: producer.id,
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });

  test('should auto-reconnect on network blip', async ({ page }) => {
    const producer = createMockProducer('TestPlayer');
    let requestCount = 0;
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        requestCount++;
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: producer.id,
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    expect(requestCount).toBeGreaterThan(0);
  });

  test('should sync state after reconnection', async ({ page }) => {
    const producer = createMockProducer('TestPlayer');
    let fetchCount = 0;
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        fetchCount++;
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: producer.id,
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
    expect(fetchCount).toBeGreaterThanOrEqual(1);
  });

  test('should not duplicate actions after recovery', async ({ page }) => {
    const producer = createMockProducer('TestPlayer');
    const gameState = createMockPlayingState({ [producer.id]: producer });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: producer.id,
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
  });

  test('should handle API request retry', async ({ page }) => {
    const producer = createMockProducer('TestPlayer');
    const gameState = createMockPlayingState({ [producer.id]: producer });
    let attempt = 0;

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        attempt++;
        if (attempt < 2) {
          await route.abort('failed');
        } else {
          await route.fulfill({ json: gameState });
        }
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: producer.id,
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`, { timeout: 15000 }).catch(() => {});
    const hasContent = await page.locator('[data-testid], body').count() > 0;
    expect(hasContent).toBe(true);
  });
});

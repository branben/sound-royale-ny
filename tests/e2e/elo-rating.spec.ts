import { test, expect } from '@playwright/test';
import {
  createMockPlayingState,
  createMockFinishedState,
  createMockProducer,
  createMockSpectator,
} from './utils/game-fixtures';

test.describe('ELO Rating System', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
    });
  });

  test('should display ELO rating', async ({ page }) => {
    const player = createMockProducer('TestPlayer', { eloRating: 1250 });
    const gameState = createMockPlayingState({ [player.id]: player });

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
        playerId: player.id,
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('text=1250')).toBeVisible();
  });

  test('should show winner gains ELO', async ({ page }) => {
    const winner = createMockProducer('Winner', { eloRating: 1200, eloWins: 5, eloLosses: 2, eloMatches: 7 });
    const loser = createMockProducer('Loser', { eloRating: 1200, eloWins: 2, eloLosses: 5, eloMatches: 7 });
    const gameState = createMockFinishedState({ [winner.id]: winner, [loser.id]: loser }, winner.id);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Winner',
        playerId: winner.id,
        playerSecret: 'winner-secret',
        isSpectator: false,
        isHost: true
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('text=/Winner.*\\+/')).toBeVisible();
  });

  test('should show loser loses ELO', async ({ page }) => {
    const winner = createMockProducer('Winner', { eloRating: 1200 });
    const loser = createMockProducer('Loser', { eloRating: 1200 });
    const gameState = createMockFinishedState({ [winner.id]: winner, [loser.id]: loser }, winner.id);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Loser',
        playerId: loser.id,
        playerSecret: 'loser-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('text=/Loser.*-/')).toBeVisible();
  });

  test('should show ELO stats in final standings', async ({ page }) => {
    const winner = createMockProducer('Winner', { eloRating: 1300, eloWins: 6, eloLosses: 2, eloMatches: 8 });
    const loser = createMockProducer('Loser', { eloRating: 1100, eloWins: 2, eloLosses: 6, eloMatches: 8 });
    const gameState = createMockFinishedState({ [winner.id]: winner, [loser.id]: loser }, winner.id);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Winner',
        playerId: winner.id,
        playerSecret: 'winner-secret',
        isSpectator: false,
        isHost: true
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('text=1300')).toBeVisible();
    await expect(page.locator('text=1100')).toBeVisible();
  });

  test('should not affect spectator ELO', async ({ page }) => {
    const producer = createMockProducer('Producer', { eloRating: 1200 });
    const spectator = createMockSpectator('Spectator', { eloRating: 1000 });
    const gameState = createMockFinishedState({ [producer.id]: producer, [spectator.id]: spectator }, producer.id);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Spectator',
        playerId: spectator.id,
        playerSecret: 'spectator-secret',
        isSpectator: true,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}?spectator=true`);
    expect(spectator.eloRating).toBe(1000);
  });

  test('should persist ELO across games', async ({ page }) => {
    const player = createMockProducer('Player', { eloRating: 1400, eloWins: 10, eloLosses: 5, eloMatches: 15 });
    const gameState = createMockFinishedState({ [player.id]: player }, player.id);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Player',
        playerId: player.id,
        playerSecret: 'player-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('text=1400')).toBeVisible();
    await expect(page.locator('text=10W')).toBeVisible();
    await expect(page.locator('text=5L')).toBeVisible();
  });
});

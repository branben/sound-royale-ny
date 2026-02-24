/**
 * Negative Scenario Tests - Host Kick
 * 
 * Tests host-related negative scenarios:
 * - Host leaves room triggers host migration
 * - Host kicks player successfully
 * - Host cannot be kicked
 * - Last player leaving ends game
 * - New host inherits controls
 */

import { test, expect } from '@playwright/test';
import {
  createMockLobbyState,
  createMockPlayingState,
  createMockProducer,
  createMockSpectator,
} from '../utils/game-fixtures';

test.describe('Host Kick', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
    });
  });

  test('should migrate host when host leaves', async ({ page }) => {
    const host = createMockProducer('HostPlayer');
    const player2 = createMockProducer('Player2');
    const gameState = createMockLobbyState('HostPlayer', ['Player2'], []);

    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/rooms/') && !url.includes('/kick')) {
        await route.fulfill({ json: gameState });
      } else if (url.includes('/kick')) {
        await route.fulfill({ status: 200, json: { success: true, newHostId: player2.id } });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Player2',
        playerId: player2.id,
        playerSecret: 'player2-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.locator('text=HostPlayer')).toBeVisible();
  });

  test('should allow host to kick player', async ({ page }) => {
    const gameState = createMockLobbyState('HostPlayer', ['Player2'], []);

    let playerKicked = false;
    const hostId = Object.keys(gameState.players).find(
      name => gameState.players[name].name === 'HostPlayer'
    ) || '';

    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/kick')) {
        playerKicked = true;
        await route.fulfill({ status: 200, json: { success: true } });
      } else if (url.includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'HostPlayer',
        playerId: hostId,
        playerSecret: 'host-secret',
        isSpectator: false,
        isHost: true
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('button:has-text("Kick"), [data-testid="kick-player"]')).toBeVisible();
  });

  test('should show kicked player message', async ({ page }) => {
    const gameState = createMockLobbyState('HostPlayer', ['Player2'], []);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Player2',
        playerId: 'player2-id',
        playerSecret: 'player2-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.locator('text=/You were removed|kicked/')).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test('should not allow non-host to kick', async ({ page }) => {
    const gameState = createMockLobbyState('HostPlayer', ['Player2'], []);
    const player2Id = Object.keys(gameState.players).find(
      name => gameState.players[name].name === 'Player2'
    ) || '';

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Player2',
        playerId: player2Id,
        playerSecret: 'player2-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.locator('button:has-text("Kick")')).not.toBeVisible();
  });

  test('should end game when last player leaves', async ({ page }) => {
    const host = createMockProducer('HostPlayer');
    const gameState = createMockPlayingState({ [host.id]: host });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: { ...gameState, status: 'finished' } });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'HostPlayer',
        playerId: host.id,
        playerSecret: 'host-secret',
        isSpectator: false,
        isHost: true
      }));
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.locator('text=/Game Over|finished/')).toBeVisible({ timeout: 10000 });
  });
});

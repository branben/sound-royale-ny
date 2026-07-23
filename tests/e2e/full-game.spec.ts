/**
 * Full 3-Round Game E2E Tests
 *
 * Multi-round UI components and infrastructure now implemented:
 * - totalRounds field in GameState type
 * - MultiRoundConfig component for game setup
 * - Enhanced RoundIndicator with total rounds display
 * - ELO delta display components
 */

import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';
import {
  createMockLobbyState,
  createMockPlayingState,
  createMockFinishedState,
  createMockProducer,
  toRoomResponse,
} from './utils/game-fixtures';

test.describe('Full 3-Round Game', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test.skip('should configure game with 3 rounds [needs multi-round-config component]', async ({
    page,
  }) => {
    const gameState = createMockLobbyState('HostPlayer', ['Player1'], []);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: { ...toRoomResponse(gameState), total_rounds: 3 } });
      } else {
        await route.continue();
      }
    });

    const hostId = Object.keys(gameState.players)[0];
    await setupPlayerSession(page, {
      playerName: 'HostPlayer',
      playerId: hostId,
      playerSecret: 'host-secret',
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="multi-round-config"]')).toBeVisible();
    await expect(page.locator('[data-testid="multi-round-config"]')).toContainText('3 Rounds');
  });

  test.skip('should progress from round 1 to round 2 [needs round progression UI]', async ({
    page,
  }) => {
    const producer = createMockProducer('Player1');
    let currentRound = 1;

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        currentRound++;
        const state = createMockPlayingState({ [producer.id]: producer }, currentRound);
        await route.fulfill({ json: toRoomResponse(state) });
      } else {
        await route.continue();
      }
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'player-secret',
    });

    await page.goto(`/room/test-room`);
    await expect(page.locator('[data-testid="round-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="round-indicator"]')).toContainText('2/');
  });

  test.skip('should progress from round 2 to round 3 [needs round progression UI]', async ({
    page,
  }) => {
    const producer = createMockProducer('Player1');

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        const state = createMockPlayingState({ [producer.id]: producer }, 3);
        await route.fulfill({ json: toRoomResponse(state) });
      } else {
        await route.continue();
      }
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'player-secret',
    });

    await page.goto(`/room/test-room`);
    await expect(page.locator('[data-testid="round-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="round-indicator"]')).toContainText('3/');
  });

  test.skip('should accumulate scores across rounds [needs total-score component]', async ({
    page,
  }) => {
    const producer = createMockProducer('Player1');
    const gameState = createMockFinishedState({ [producer.id]: producer }, producer.id, 3);

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: producer,
        playerSecret: 'player-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'player-secret',
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="total-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-score"]')).toContainText('300');
  });

  test.skip('should determine final winner after round 3 [visual snapshot missing — tracked test rot #169]', async ({
    page,
  }) => {
    const winner = createMockProducer('Winner');
    const loser = createMockProducer('Loser');
    const gameState = createMockFinishedState(
      { [winner.id]: winner, [loser.id]: loser },
      winner.id,
      3,
    );

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: winner,
        playerSecret: 'winner-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: winner.name,
      playerId: winner.id,
      playerSecret: 'winner-secret',
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="winner-announcement"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('[data-testid="winner-announcement"]')).toContainText('Winner');

    // Visual-regression gate: finished board + winner overlay.
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot('full-game-winner-screen.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test.skip('should show game over screen for abandoned game [visual snapshot missing — tracked test rot #169]', async ({
    page,
  }) => {
    const producer = createMockProducer('Player1');
    const gameState = createMockFinishedState({ [producer.id]: producer }, null, 3);

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: producer,
        playerSecret: 'player-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'player-secret',
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="game-over-screen"]')).toBeVisible();
    await expect(page.locator('[data-testid="game-over-screen"]')).toContainText('GAME OVER');

    // Visual-regression gate: finished board + game-over overlay.
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot('full-game-gameover-screen.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test.skip('should show play again option [needs play-again button in winner flow]', async ({
    page,
  }) => {
    const producer = createMockProducer('Player1');
    const gameState = createMockFinishedState({ [producer.id]: producer }, producer.id, 3);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: toRoomResponse(gameState) });
      } else {
        await route.continue();
      }
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'player-secret',
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(
      page.locator('button:has-text("Play Again"), [data-testid="play-again"]'),
    ).toBeVisible();
  });
});

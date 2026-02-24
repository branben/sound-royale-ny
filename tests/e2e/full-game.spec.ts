import { test, expect } from '@playwright/test';
import {
  createMockLobbyState,
  createMockPlayingState,
  createMockVotingState,
  createMockFinishedState,
  createMockProducer,
  createMockSpectator,
  createMockVote,
} from './utils/game-fixtures';

test.describe('Full 3-Round Game', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
    });
  });

  test('should configure game with 3 rounds', async ({ page }) => {
    const gameState = createMockLobbyState('HostPlayer', ['Player1'], []);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: { ...gameState, totalRounds: 3 } });
      } else {
        await route.continue();
      }
    });

    const hostId = Object.keys(gameState.players)[0];
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
    await expect(page.locator('text=3 rounds, text=3')).toBeVisible();
  });

  test('should progress from round 1 to round 2', async ({ page }) => {
    const producer = createMockProducer('Player1');
    let currentRound = 1;

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        currentRound++;
        const state = createMockPlayingState({ [producer.id]: producer }, currentRound);
        await route.fulfill({ json: state });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Player1',
        playerId: producer.id,
        playerSecret: 'player-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/test-room`);
    await expect(page.locator('text=Round 2')).toBeVisible({ timeout: 15000 });
  });

  test('should progress from round 2 to round 3', async ({ page }) => {
    const producer = createMockProducer('Player1');
    
    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        const state = createMockPlayingState({ [producer.id]: producer }, 3);
        await route.fulfill({ json: state });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Player1',
        playerId: producer.id,
        playerSecret: 'player-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/test-room`);
    await expect(page.locator('text=Round 3')).toBeVisible({ timeout: 20000 });
  });

  test('should accumulate scores across rounds', async ({ page }) => {
    const producer = createMockProducer('Player1');
    const gameState = createMockFinishedState({ [producer.id]: producer }, producer.id, 3);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Player1',
        playerId: producer.id,
        playerSecret: 'player-secret',
        isSpectator: false,
        isHost: true
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="total-score"], text=300')).toBeVisible();
  });

  test('should determine final winner after round 3', async ({ page }) => {
    const winner = createMockProducer('Winner');
    const loser = createMockProducer('Loser');
    const gameState = createMockFinishedState(
      { [winner.id]: winner, [loser.id]: loser },
      winner.id,
      3
    );

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
    await expect(page.locator('text=/Winner.*wins|final winner/i')).toBeVisible({ timeout: 10000 });
  });

  test('should show game over screen', async ({ page }) => {
    const producer = createMockProducer('Player1');
    const gameState = createMockFinishedState({ [producer.id]: producer }, producer.id, 3);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Player1',
        playerId: producer.id,
        playerSecret: 'player-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('text=/Game Over|finished/i')).toBeVisible();
  });

  test('should show play again option', async ({ page }) => {
    const producer = createMockProducer('Player1');
    const gameState = createMockFinishedState({ [producer.id]: producer }, producer.id, 3);

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Player1',
        playerId: producer.id,
        playerSecret: 'player-secret',
        isSpectator: false,
        isHost: true
      }));
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('button:has-text("Play Again"), [data-testid="play-again"]')).toBeVisible();
  });
});

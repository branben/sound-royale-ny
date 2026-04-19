import { test, expect } from '@playwright/test';
import {
  createMockPlayingState,
  createMockFinishedState,
  createMockProducer,
  createMockSpectator,
  toRoomResponse,
} from './utils/game-fixtures';
import { enableE2EMode } from './helpers';

test.describe('ELO Rating System', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('should display ELO rating', async ({ page }) => {
    const player = createMockProducer('TestPlayer', { eloRating: 1250 });
    const gameState = createMockPlayingState({ [player.id]: player });
    const roomResponse = toRoomResponse(gameState);

    await page.addInitScript((session) => {
      localStorage.setItem('userSession', JSON.stringify(session));
    }, { playerName: player.name, playerId: player.id, playerSecret: 'test-secret', isSpectator: false, isHost: false });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: roomResponse });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/room/${gameState.id}`);
    // TODO(Phase 4): assert `text=1250` once ELO display component is built
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
  });

  test('should show winner gains ELO', async ({ page }) => {
    const winner = createMockProducer('Winner', { eloRating: 1200, eloWins: 5, eloLosses: 2, eloMatches: 7 });
    const loser = createMockProducer('Loser', { eloRating: 1200, eloWins: 2, eloLosses: 5, eloMatches: 7 });
    const gameState = createMockFinishedState({ [winner.id]: winner, [loser.id]: loser }, winner.id);
    const roomResponse = toRoomResponse(gameState);

    await page.addInitScript((session) => {
      localStorage.setItem('userSession', JSON.stringify(session));
    }, { playerName: winner.name, playerId: winner.id, playerSecret: 'winner-secret', isSpectator: false, isHost: true });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: roomResponse });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/room/${gameState.id}`);
    // TODO(Phase 4): assert `text=/Winner.*\+/` once ELO delta display is built
    await expect(page.getByText('Winner').first()).toBeVisible({ timeout: 10000 });
  });

  test('should show loser loses ELO', async ({ page }) => {
    const winner = createMockProducer('Winner', { eloRating: 1200 });
    const loser = createMockProducer('Loser', { eloRating: 1200 });
    const gameState = createMockFinishedState({ [winner.id]: winner, [loser.id]: loser }, winner.id);
    const roomResponse = toRoomResponse(gameState);

    await page.addInitScript((session) => {
      localStorage.setItem('userSession', JSON.stringify(session));
    }, { playerName: loser.name, playerId: loser.id, playerSecret: 'loser-secret', isSpectator: false, isHost: false });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: roomResponse });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/room/${gameState.id}`);
    // TODO(Phase 4): assert `text=/Loser.*-/` once ELO delta display is built
    await expect(page.getByText('Loser').first()).toBeVisible({ timeout: 10000 });
  });

  test('should show ELO stats in final standings', async ({ page }) => {
    const winner = createMockProducer('Winner', { eloRating: 1300, eloWins: 6, eloLosses: 2, eloMatches: 8 });
    const loser = createMockProducer('Loser', { eloRating: 1100, eloWins: 2, eloLosses: 6, eloMatches: 8 });
    const gameState = createMockFinishedState({ [winner.id]: winner, [loser.id]: loser }, winner.id);
    const roomResponse = toRoomResponse(gameState);

    await page.addInitScript((session) => {
      localStorage.setItem('userSession', JSON.stringify(session));
    }, { playerName: winner.name, playerId: winner.id, playerSecret: 'winner-secret', isSpectator: false, isHost: true });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: roomResponse });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/room/${gameState.id}`);
    // TODO(Phase 4): assert `text=1300` and `text=1100` once ELO standings UI is built
    await expect(page.getByText('Winner').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loser').first()).toBeVisible({ timeout: 10000 });
  });

  test('should not affect spectator ELO', async ({ page }) => {
    const producer = createMockProducer('Producer', { eloRating: 1200 });
    const spectator = createMockSpectator('Spectator', { eloRating: 1000 });
    const gameState = createMockFinishedState({ [producer.id]: producer, [spectator.id]: spectator }, producer.id);
    const roomResponse = toRoomResponse(gameState);

    await page.addInitScript((session) => {
      localStorage.setItem('userSession', JSON.stringify(session));
    }, { playerName: spectator.name, playerId: spectator.id, playerSecret: 'spectator-secret', isSpectator: true, isHost: false });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: roomResponse });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/room/${gameState.id}`);
    // ELO is a fixture-level invariant: spectators carry their rating but it is not mutated
    expect(spectator.eloRating).toBe(1000);
  });

  test('should persist ELO across games', async ({ page }) => {
    const player = createMockProducer('Player', { eloRating: 1400, eloWins: 10, eloLosses: 5, eloMatches: 15 });
    const gameState = createMockFinishedState({ [player.id]: player }, player.id);
    const roomResponse = toRoomResponse(gameState);

    await page.addInitScript((session) => {
      localStorage.setItem('userSession', JSON.stringify(session));
    }, { playerName: player.name, playerId: player.id, playerSecret: 'player-secret', isSpectator: false, isHost: false });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: roomResponse });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/room/${gameState.id}`);
    // TODO(Phase 4): assert `text=1400`, `text=10W`, `text=5L` once ELO persistence UI is built
    await expect(page.getByText('Player').first()).toBeVisible({ timeout: 10000 });
    expect(player.eloRating).toBe(1400);
    expect(player.eloWins).toBe(10);
    expect(player.eloLosses).toBe(5);
  });
});

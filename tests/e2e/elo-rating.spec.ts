import { test, expect } from '@playwright/test';
import {
  createMockPlayingState,
  createMockFinishedState,
  createMockProducer,
  createMockSpectator,
  toRoomResponse,
} from './utils/game-fixtures';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';

test.describe('ELO Rating System', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('should display ELO rating', async ({ page }) => {
    const player = createMockProducer('TestPlayer', { eloRating: 1250 });
    const gameState = createMockPlayingState({ [player.id]: player });
    const roomResponse = toRoomResponse(gameState);

    await setupPlayerSession(page, {
      playerName: player.name,
      playerId: player.id,
      playerSecret: 'test-secret',
    });
    await mockApiRoutes(page, {
      roomResponse,
      rejoin: { player, playerSecret: 'test-secret' },
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('elo-rating')).toContainText('ELO: 1250');
  });

  test('should show winner gains ELO', async ({ page }) => {
    const winner = createMockProducer('Winner', {
      eloRating: 1200,
      eloWins: 5,
      eloLosses: 2,
      eloMatches: 7,
    });
    const loser = createMockProducer('Loser', {
      eloRating: 1200,
      eloWins: 2,
      eloLosses: 5,
      eloMatches: 7,
    });
    const gameState = createMockFinishedState(
      { [winner.id]: winner, [loser.id]: loser },
      winner.id,
    );
    const roomResponse = toRoomResponse(gameState);

    await setupPlayerSession(page, {
      playerName: winner.name,
      playerId: winner.id,
      playerSecret: 'winner-secret',
    });
    await mockApiRoutes(page, {
      roomResponse,
      rejoin: { player: winner, playerSecret: 'winner-secret' },
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="elo-delta-display"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="elo-delta-display"]')).toContainText('Winner');
    await expect(page.locator('[data-testid="elo-delta-display"]')).toContainText('+');
  });

  test('should show loser loses ELO', async ({ page }) => {
    const winner = createMockProducer('Winner', { eloRating: 1200 });
    const loser = createMockProducer('Loser', { eloRating: 1200 });
    const gameState = createMockFinishedState(
      { [winner.id]: winner, [loser.id]: loser },
      winner.id,
    );
    const roomResponse = toRoomResponse(gameState);

    await setupPlayerSession(page, {
      playerName: loser.name,
      playerId: loser.id,
      playerSecret: 'loser-secret',
    });
    await mockApiRoutes(page, {
      roomResponse,
      rejoin: { player: loser, playerSecret: 'loser-secret' },
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.locator('[data-testid="elo-delta-display"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="elo-delta-display"]')).toContainText('Loser');
    await expect(page.locator('[data-testid="elo-delta-display"]')).toContainText('-');
  });

  test('should show ELO stats in final standings', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const winner = createMockProducer('Winner', {
      eloRating: 1300,
      eloWins: 6,
      eloLosses: 2,
      eloMatches: 8,
    });
    const loser = createMockProducer('Loser', {
      eloRating: 1100,
      eloWins: 2,
      eloLosses: 6,
      eloMatches: 8,
    });
    const gameState = createMockFinishedState(
      { [winner.id]: winner, [loser.id]: loser },
      winner.id,
    );
    const roomResponse = toRoomResponse(gameState);

    await setupPlayerSession(page, {
      playerName: winner.name,
      playerId: winner.id,
      playerSecret: 'winner-secret',
    });
    await mockApiRoutes(page, {
      roomResponse,
      rejoin: { player: winner, playerSecret: 'winner-secret' },
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.getByText('Winner').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loser').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`player-elo-stats-${winner.id}`)).toHaveText(
      'ELO: 1300 · 6W / 2L / 8M',
    );
    await expect(page.getByTestId(`player-elo-stats-${loser.id}`)).toHaveText(
      'ELO: 1100 · 2W / 6L / 8M',
    );
  });

  test('should not affect spectator ELO', async ({ page }) => {
    const producer = createMockProducer('Producer', { eloRating: 1200 });
    const spectator = createMockSpectator('Spectator', { eloRating: 1000 });
    const gameState = createMockFinishedState(
      { [producer.id]: producer, [spectator.id]: spectator },
      producer.id,
    );
    const roomResponse = toRoomResponse(gameState);

    await setupPlayerSession(page, {
      playerName: spectator.name,
      playerId: spectator.id,
      playerSecret: 'spectator-secret',
    });
    await mockApiRoutes(page, {
      roomResponse,
      rejoin: { player: spectator, playerSecret: 'spectator-secret' },
    });

    await page.goto(`/room/${gameState.id}`);
    // ELO is a fixture-level invariant: spectators carry their rating but it is not mutated
    await expect(page.getByTestId(`player-elo-stats-${spectator.id}`)).toBeHidden();
    expect(spectator.eloRating).toBe(1000);
  });

  test('should persist ELO across games', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const player = createMockProducer('Player', {
      eloRating: 1400,
      eloWins: 10,
      eloLosses: 5,
      eloMatches: 15,
    });
    const gameState = createMockFinishedState({ [player.id]: player }, player.id);
    const roomResponse = toRoomResponse(gameState);

    await setupPlayerSession(page, {
      playerName: player.name,
      playerId: player.id,
      playerSecret: 'player-secret',
    });
    await mockApiRoutes(page, {
      roomResponse,
      rejoin: { player, playerSecret: 'player-secret' },
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.getByText('Player').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`player-elo-stats-${player.id}`)).toHaveText(
      'ELO: 1400 · 10W / 5L / 15M',
    );
    await expect(page.getByTestId('elo-rating')).toContainText('ELO: 1400');
    expect(player.eloRating).toBe(1400);
    expect(player.eloWins).toBe(10);
    expect(player.eloLosses).toBe(5);
  });
});

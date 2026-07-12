import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from '../helpers';
import {
  createMockFinishedState,
  createMockPlayingStateWithoutGenre,
  createMockProducer,
  createMockSpectator,
  toRoomResponse,
} from '../utils/game-fixtures';

test.describe('Voting Guardrails', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('does not render vote controls once the game is finished', async ({ page }) => {
    const producer = createMockProducer('Producer1');
    const spectator = createMockSpectator('Spectator1');
    const gameState = createMockFinishedState(
      {
        [producer.id]: producer,
        [spectator.id]: spectator,
      },
      producer.id,
      1,
    );

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: spectator,
        playerSecret: 'spectator-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: spectator.name,
      playerId: spectator.id,
      playerSecret: 'spectator-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.getByTestId('voting-panel')).not.toBeVisible();
    await expect(page.getByTestId('winner-announcement')).toBeVisible();
  });

  test('does not render vote controls for producers during live play', async ({ page }) => {
    const producer1 = createMockProducer('Producer1');
    const producer2 = createMockProducer('Producer2');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer1.id]: producer1,
      [producer2.id]: producer2,
    });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: producer1,
        playerSecret: 'producer1-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: producer1.name,
      playerId: producer1.id,
      playerSecret: 'producer1-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(page.getByTestId('voting-panel')).not.toBeVisible();
  });

  test('keeps spectators on the spectator dashboard when vote controls are unavailable', async ({
    page,
  }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const producer = createMockProducer('Producer1');
    const spectator = createMockSpectator('Spectator1');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer.id]: producer,
      [spectator.id]: spectator,
    });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: spectator,
        playerSecret: 'spectator-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: spectator.name,
      playerId: spectator.id,
      playerSecret: 'spectator-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.getByTestId('request-to-play')).toBeVisible();
    await expect(page.getByTestId('voting-panel')).not.toBeVisible();
  });

  test('does not expose a vote endpoint to a producer-only room', async ({ page }) => {
    const producer1 = createMockProducer('Producer1');
    const producer2 = createMockProducer('Producer2');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer1.id]: producer1,
      [producer2.id]: producer2,
    });
    let voteRequests = 0;

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: producer1,
        playerSecret: 'producer1-secret',
      },
      vote: async (route) => {
        voteRequests += 1;
        await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      },
    });

    await setupPlayerSession(page, {
      playerName: producer1.name,
      playerId: producer1.id,
      playerSecret: 'producer1-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.getByTestId('voting-panel')).not.toBeVisible();
    expect(voteRequests).toBe(0);
  });
});

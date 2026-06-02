import { Page, test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';
import {
  createMockPlayingStateWithoutGenre,
  createMockProducer,
  createMockSpectator,
  toRoomResponse,
} from './utils/game-fixtures';

function trackRejoinRequests(page: Page) {
  let count = 0;

  page.on('request', (request) => {
    if (request.url().includes('/rejoin_game/')) {
      count += 1;
    }
  });

  return {
    count: () => count,
    reset: () => {
      count = 0;
    },
  };
}

test.describe('API Rejoin Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('restores a producer board through rejoin_game after reload', async ({ page }) => {
    const producer = createMockProducer('ReturningProducer');
    const opponent = createMockProducer('OpponentProducer');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer.id]: producer,
      [opponent.id]: opponent,
    });
    const rejoinTracker = trackRejoinRequests(page);

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: producer,
        playerSecret: 'producer-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect.poll(rejoinTracker.count).toBeGreaterThan(0);

    rejoinTracker.reset();
    await page.reload();

    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(page.getByTestId(`player-name-${producer.name}`)).toBeVisible();
    await expect.poll(rejoinTracker.count).toBeGreaterThan(0);
  });

  test('restores a spectator dashboard through rejoin_game after reload', async ({ page }) => {
    const producer1 = createMockProducer('ProducerOne');
    const producer2 = createMockProducer('ProducerTwo');
    const spectator = createMockSpectator('ReturningSpectator');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer1.id]: producer1,
      [producer2.id]: producer2,
      [spectator.id]: spectator,
    });
    const rejoinTracker = trackRejoinRequests(page);

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
    await expect.poll(rejoinTracker.count).toBeGreaterThan(0);

    rejoinTracker.reset();
    await page.reload();

    await expect(page.getByTestId('request-to-play')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Battle Arena' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your Board' })).not.toBeVisible();
    await expect.poll(rejoinTracker.count).toBeGreaterThan(0);
  });
});

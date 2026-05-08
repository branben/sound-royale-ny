import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';
import {
  createMockFinishedState,
  createMockPlayingStateWithoutGenre,
  createMockProducer,
  createMockScoreInfo,
  createMockSpectator,
  toRoomResponse,
} from './utils/game-fixtures';

test.describe('Spectator Mode Experience', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('renders the spectator dashboard header and round label', async ({ page }) => {
    const producer1 = createMockProducer('HostPlayer');
    const producer2 = createMockProducer('ChallengerPlayer');
    const spectator = createMockSpectator('TestSpectator');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer1.id]: producer1,
      [producer2.id]: producer2,
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

    await expect(page.getByRole('banner').getByRole('heading', { name: 'Sound Royale' })).toBeVisible();
    await expect(page.getByTestId('round-stage').getByText('Round 1')).toBeVisible();
  });

  test('shows the game phase badge and request-to-play button', async ({ page }) => {
    const producer1 = createMockProducer('HostPlayer');
    const producer2 = createMockProducer('ChallengerPlayer');
    const spectator = createMockSpectator('TestSpectator');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer1.id]: producer1,
      [producer2.id]: producer2,
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

    await expect(page.getByRole('heading', { name: 'Battle Arena' })).toBeVisible();
    await expect(page.getByTestId('request-to-play')).toBeVisible();
  });

  test('lists producers in the leaderboard and jump controls', async ({ page }) => {
    const producer1 = createMockProducer('Producer1');
    const producer2 = createMockProducer('Producer2');
    const spectator = createMockSpectator('Spectator');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer1.id]: producer1,
      [producer2.id]: producer2,
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

    await expect(page.getByTestId(`player-name-${producer1.name}`)).toBeVisible();
    await expect(page.getByTestId(`player-name-${producer2.name}`)).toBeVisible();
    await expect(page.getByText('Jump to:')).toBeVisible();
  });

  test('renders a player board display for each producer', async ({ page }) => {
    const producer1 = createMockProducer('Producer1');
    const producer2 = createMockProducer('Producer2');
    const spectator = createMockSpectator('Spectator');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer1.id]: producer1,
      [producer2.id]: producer2,
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

    await expect(page.getByRole('heading', { name: producer1.name })).toBeVisible();
    await expect(page.getByRole('heading', { name: producer2.name })).toBeVisible();
  });

  test('keeps the spectator dashboard after a reload-style reconnect', async ({ page }) => {
    const producer1 = createMockProducer('Producer1');
    const producer2 = createMockProducer('Producer2');
    const spectator = createMockSpectator('Spectator');
    const gameState = createMockPlayingStateWithoutGenre({
      [producer1.id]: producer1,
      [producer2.id]: producer2,
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

    await page.reload();

    await expect(page.getByTestId('request-to-play')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Battle Arena' })).toBeVisible();
  });

  test('shows the finished-state winner announcement', async ({ page }) => {
    const winner = createMockProducer('Winner', {
      scoreInfo: createMockScoreInfo(200, 3),
    });
    const challenger = createMockProducer('Challenger', {
      scoreInfo: createMockScoreInfo(100, 1),
    });
    const spectator = createMockSpectator('Spectator');
    const gameState = createMockFinishedState(
      {
        [winner.id]: winner,
        [challenger.id]: challenger,
        [spectator.id]: spectator,
      },
      winner.id
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

    await expect(page.getByTestId('winner-announcement')).toBeVisible();
    await expect(page.getByTestId('winner-announcement')).toContainText('WINNER!');
    await expect(
      page.getByTestId('winner-announcement').getByText(new RegExp(`^${winner.name}$`))
    ).toBeVisible();
  });
});

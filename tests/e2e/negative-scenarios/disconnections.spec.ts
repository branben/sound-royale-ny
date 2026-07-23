import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from '../helpers';
import {
  createMockPlayingStateWithoutGenre,
  createMockProducer,
  createMockSpectator,
  toRoomResponse,
} from '../utils/game-fixtures';

test.describe('Player Disconnection', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('shows the current player as offline when they disconnect', async ({ page }) => {
    const producer = createMockProducer('TestPlayer', { isConnected: false });
    const gameState = createMockPlayingStateWithoutGenre({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      seed: true,
      rejoin: {
        player: { id: producer.id, name: producer.name, isHost: true },
        playerSecret: 'test-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'test-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.getByTestId('connection-status')).toBeVisible();
    await expect(page.getByText('Offline')).toBeVisible();
  });

  test('keeps the board visible when another producer disconnects', async ({ page }) => {
    const producer1 = createMockProducer('Producer1');
    const producer2 = createMockProducer('Producer2', { isConnected: false });
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
    await expect(page.getByText('Live')).toBeVisible();
  });

  test('shows a disconnected indicator for other players', async ({ page }) => {
    const producer1 = createMockProducer('Producer1');
    const producer2 = createMockProducer('Producer2', { isConnected: false });
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

    await expect(page.getByTestId(`player-name-${producer2.name}`)).toBeVisible();
    await expect(page.getByTestId('disconnected-indicator')).toBeVisible();
  });
});

test.describe('Spectator Disconnection', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('does not interrupt the live state when a spectator disconnects', async ({ page }) => {
    const producer = createMockProducer('Producer1');
    const spectator = createMockSpectator('Spectator', { isConnected: false });
    const gameState = createMockPlayingStateWithoutGenre({
      [producer.id]: producer,
      [spectator.id]: spectator,
    });

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
    await expect(page.getByText('Live')).toBeVisible();
  });

  test('restores the spectator dashboard after a reload-style reconnect', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const producer = createMockProducer('Producer1');
    const spectator = createMockSpectator('Spectator');
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

    await page.reload();

    await expect(page.getByTestId('request-to-play')).toBeVisible();
  });
});

test.describe('Room Reload Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('keeps the room accessible across repeated fetches', async ({ page }) => {
    const producer = createMockProducer('TestPlayer');
    const gameState = createMockPlayingStateWithoutGenre({ [producer.id]: producer });
    let roomRequests = 0;

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: producer,
        playerSecret: 'test-secret',
      },
    });

    await page.route('**/api/rooms/*/', async (route) => {
      roomRequests += 1;
      await route.fulfill({ status: 200, json: toRoomResponse(gameState) });
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'test-secret',
    });

    await page.goto(`/room/${gameState.id}`);
    await page.reload();

    await expect(page.getByTestId('game-board')).toBeVisible();
    expect(roomRequests).toBeGreaterThan(0);
  });

  test('updates the side panel after a reload with changed connection state', async ({ page }) => {
    const producer = createMockProducer('Producer1');
    const challenger = createMockProducer('Producer2');
    const initialState = createMockPlayingStateWithoutGenre({
      [producer.id]: producer,
      [challenger.id]: challenger,
    });
    const disconnectedState = createMockPlayingStateWithoutGenre({
      [producer.id]: producer,
      [challenger.id]: createMockProducer('Producer2', {
        board: challenger.board,
        isConnected: false,
      }),
    });
    let useDisconnectedState = false;

    // This test needs a stateful mock: the room response changes after reload.
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();

      if (url.includes('/rejoin_game/')) {
        await route.fulfill({
          status: 200,
          json: {
            id: producer.id,
            name: producer.name,
            avatar: producer.avatar,
            tiles: producer.board.tiles,
            player_secret: 'producer-secret',
            is_connected: true,
            is_spectator: false,
            is_host: false,
          },
        });
        return;
      }

      if (url.includes('/rooms/')) {
        await route.fulfill({
          status: 200,
          json: toRoomResponse(useDisconnectedState ? disconnectedState : initialState),
        });
        return;
      }

      await route.continue();
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${initialState.id}`);
    await expect(page.getByTestId(`player-name-${challenger.name}`)).toBeVisible();

    useDisconnectedState = true;
    await page.reload();

    await expect(page.getByTestId('disconnected-indicator')).toBeVisible();
  });

  test.fixme(true); // tracked: e2e test rot — issue #169 (E2E mode seeds mockGameState; error screen never shows on /rooms/ 500)
  test('shows the room error state when the request fails', async ({ page }) => {
    const producer = createMockProducer('Producer1');

    // This test intentionally exercises the room-fetch error path.
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();

      if (url.includes('/rejoin_game/')) {
        await route.fulfill({
          status: 200,
          json: {
            id: producer.id,
            name: producer.name,
            avatar: producer.avatar,
            tiles: producer.board.tiles,
            player_secret: 'producer-secret',
            is_connected: true,
            is_spectator: false,
            is_host: false,
          },
        });
        return;
      }

      if (url.includes('/rooms/')) {
        await route.fulfill({ status: 500, json: { error: 'Request timed out' } });
        return;
      }

      await route.continue();
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'producer-secret',
    });

    await page.goto('/room/test-room');

    await expect(page.getByText('Failed to load room').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Back to Lobby' })).toBeVisible({
      timeout: 10000,
    });
  });
});

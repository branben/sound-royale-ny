import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';
import {
  createMockBoard,
  createMockFinishedState,
  createMockLobbyState,
  createMockPlayingStateWithoutGenre,
  createMockProducer,
  createMockScoreInfo,
  createMockSpectator,
  toRoomResponse,
} from './utils/game-fixtures';

type TestPlayer = ReturnType<typeof createMockProducer>;

function findPlayerByName(
  players: Record<string, TestPlayer>,
  name: string
): TestPlayer {
  const player = Object.values(players).find((entry) => entry.name === name);

  if (!player) {
    throw new Error(`Unable to find player "${name}" in fixture`);
  }

  return player;
}

test.describe('Producer Flow', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('shows the joined producer board for a live round', async ({ page }) => {
    const host = createMockProducer('HostPlayer');
    const producer = createMockProducer('Player1');
    const gameState = createMockPlayingStateWithoutGenre({
      [host.id]: host,
      [producer.id]: producer,
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

    await expect(page.getByRole('heading', { name: 'Your Board' })).toBeVisible();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(page.getByTestId(`player-name-${producer.name}`)).toBeVisible();
  });

  test('renders a 3x3 bingo board with all tile genres', async ({ page }) => {
    const board = createMockBoard([
      'Rock',
      'Jazz',
      'HipHop',
      'Pop',
      'Electronic',
      'R&B',
      'Country',
      'Classical',
      'Metal',
    ]);
    const producer = createMockProducer('TestPlayer', { board });
    const gameState = createMockPlayingStateWithoutGenre({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: producer,
        playerSecret: 'test-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'test-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.getByTestId('bingo-tile')).toHaveCount(9);
    await expect(page.getByText('Rock')).toBeVisible();
    await expect(page.getByText('Jazz')).toBeVisible();
    await expect(page.getByText('Metal')).toBeVisible();
  });

  test('opens the upload drawer when a producer selects an empty tile', async ({ page }) => {
    const producer = createMockProducer('TestPlayer');
    const gameState = createMockPlayingStateWithoutGenre({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: producer,
        playerSecret: 'test-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'test-secret',
    });

    await page.goto(`/room/${gameState.id}`);
    await page.getByTestId('bingo-tile').first().click();

    await expect(page.getByText(/Upload Audio for/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload Track' })).toBeVisible();
  });

  test('routes spectators to the spectator dashboard instead of the producer board', async ({ page }) => {
    const producer = createMockProducer('Producer');
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
    await expect(page.getByRole('heading', { name: 'Your Board' })).not.toBeVisible();
  });

  test('shows start battle controls to the joined host in the lobby', async ({ page }) => {
    const lobbyState = createMockLobbyState('HostPlayer', ['Player2'], []);
    const host = findPlayerByName(lobbyState.players, 'HostPlayer');

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(lobbyState),
      rejoin: {
        player: host,
        playerSecret: 'host-secret',
      },
      startGame: {
        json: { status: 'started' },
      },
    });

    await setupPlayerSession(page, {
      playerName: host.name,
      playerId: host.id,
      playerSecret: 'host-secret',
    });

    await page.goto(`/room/${lobbyState.id}`);

    await expect(page.getByTestId('lobby')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Battle' })).toBeVisible();
  });

  test('hides start battle controls from joined non-host players in the lobby', async ({ page }) => {
    const lobbyState = createMockLobbyState('HostPlayer', ['Player2'], []);
    const player = findPlayerByName(lobbyState.players, 'Player2');

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(lobbyState),
      rejoin: {
        player,
        playerSecret: 'player2-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: player.name,
      playerId: player.id,
      playerSecret: 'player2-secret',
    });

    await page.goto(`/room/${lobbyState.id}`);

    await expect(page.getByTestId('lobby')).toBeVisible();
    await expect(page.getByText(/Waiting for more players to join and host to start game/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Battle' })).not.toBeVisible();
  });

  test('shows winner and score surfaces after the round is finished', async ({ page }) => {
    const winner = createMockProducer('Winner', {
      scoreInfo: createMockScoreInfo(150, 2),
    });
    const challenger = createMockProducer('Challenger', {
      scoreInfo: createMockScoreInfo(100, 1),
    });
    const gameState = createMockFinishedState(
      {
        [winner.id]: winner,
        [challenger.id]: challenger,
      },
      winner.id
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

    await expect(page.getByTestId('winner-announcement')).toBeVisible();
    await expect(
      page.getByTestId('winner-announcement').getByText(new RegExp(`^${winner.name}$`))
    ).toBeVisible();
  });
});

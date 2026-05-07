import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';
import {
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

test.describe('Single Round End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test.describe('Lobby Phase', () => {
    test('shows the joined host lobby with a start battle action', async ({ page }) => {
      const lobbyState = createMockLobbyState('HostPlayer', ['Player1'], ['Spectator1']);
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
      await expect(page.getByText(new RegExp(`Room Code: ${lobbyState.id}`))).toBeVisible();
    });

    test('keeps non-host players in the waiting state until the host starts', async ({ page }) => {
      const lobbyState = createMockLobbyState('HostPlayer', ['Player1'], []);
      const player = findPlayerByName(lobbyState.players, 'Player1');

      await mockApiRoutes(page, {
        roomResponse: toRoomResponse(lobbyState),
        rejoin: {
          player,
          playerSecret: 'player-secret',
        },
      });

      await setupPlayerSession(page, {
        playerName: player.name,
        playerId: player.id,
        playerSecret: 'player-secret',
      });

      await page.goto(`/room/${lobbyState.id}`);

      await expect(page.getByTestId('lobby')).toBeVisible();
      await expect(page.getByText(/Waiting for more players to join and host to start game/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Battle' })).not.toBeVisible();
    });
  });

  test.describe('Live Round', () => {
    test('transitions into the live battle layout for producers', async ({ page }) => {
      const producer1 = createMockProducer('Producer1');
      const producer2 = createMockProducer('Producer2');
      const spectator = createMockSpectator('Spectator1');
      const gameState = createMockPlayingStateWithoutGenre({
        [producer1.id]: producer1,
        [producer2.id]: producer2,
        [spectator.id]: spectator,
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

      await expect(page.getByText('Live')).toBeVisible();
      await expect(page.getByText('Battle in Progress')).toBeVisible();
      await expect(page.getByTestId('game-board')).toBeVisible();
    });

    test('shows the round label and countdown timer in the side panel', async ({ page }) => {
      const producer = createMockProducer('Producer1');
      const gameState = createMockPlayingStateWithoutGenre({ [producer.id]: producer });

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

      await expect(page.getByText('Round: 1')).toBeVisible();
      await expect(page.getByText('Time Remaining')).toBeVisible();
      await expect(page.getByText('--:--')).toBeVisible();
    });

    test('lets a producer pick a tile and opens the upload drawer', async ({ page }) => {
      const producer = createMockProducer('Producer1');
      const gameState = createMockPlayingStateWithoutGenre({ [producer.id]: producer });

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
      await page.getByTestId('bingo-tile').first().click();

      await expect(page.getByText(/Upload Audio for/i)).toBeVisible();
    });

    test('shows the other active players in the side panel', async ({ page }) => {
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

      await expect(page.getByTestId(`player-name-${producer1.name}`)).toBeVisible();
      await expect(page.getByTestId(`player-name-${producer2.name}`)).toBeVisible();
    });
  });

  test.describe('Spectator View', () => {
    test('shows the spectator dashboard and request-to-play action', async ({ page }) => {
      const producer1 = createMockProducer('Producer1');
      const producer2 = createMockProducer('Producer2');
      const spectator = createMockSpectator('Spectator1');
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
      await expect(page.getByText('Game in Progress')).toBeVisible();
      await expect(page.getByTestId(`player-name-${producer1.name}`)).toBeVisible();
      await expect(page.getByTestId(`player-name-${producer2.name}`)).toBeVisible();
    });
  });

  test.describe('Round End', () => {
    test('announces the winner when the round finishes', async ({ page }) => {
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

    test('shows the game-over screen when the round finishes without a winner', async ({ page }) => {
      const producer = createMockProducer('Producer1', {
        scoreInfo: createMockScoreInfo(90, 1),
      });
      const gameState = createMockFinishedState({ [producer.id]: producer }, null, 1);

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

      await expect(page.getByTestId('game-over-screen')).toBeVisible();
      await expect(page.getByTestId('play-again')).toBeVisible();
    });
  });
});

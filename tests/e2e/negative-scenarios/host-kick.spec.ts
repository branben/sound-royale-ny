import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from '../helpers';
import {
  createMockFinishedState,
  createMockHostProducer,
  createMockLobbyState,
  createMockPlayingStateWithoutGenre,
  createMockProducer,
  createMockScoreInfo,
  toRoomResponse,
} from '../utils/game-fixtures';

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

test.describe('Host Controls', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('shows the joined host lobby with a start battle action', async ({ page }) => {
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

  test('keeps joined non-host players in the waiting state', async ({ page }) => {
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

    await expect(page.getByText(/Waiting for more players to join and host to start game/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Battle' })).not.toBeVisible();
  });

  test('shows kick controls to the host during a live round', async ({ page }) => {
    const host = createMockHostProducer('HostPlayer');
    const player = createMockProducer('Player2');
    const gameState = createMockPlayingStateWithoutGenre({
      [host.id]: host,
      [player.id]: player,
    });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: host,
        playerSecret: 'host-secret',
      },
      kickPlayer: {
        json: { status: 'removed' },
      },
    });

    await setupPlayerSession(page, {
      playerName: host.name,
      playerId: host.id,
      playerSecret: 'host-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.getByTestId(`player-name-${host.name}`)).toBeVisible();
    await expect(page.getByTestId(`player-name-${player.name}`)).toBeVisible();
    await expect(page.getByTestId('kick-player').first()).toBeVisible();
  });

  test('hides kick controls from non-host players during a live round', async ({ page }) => {
    const host = createMockHostProducer('HostPlayer');
    const player = createMockProducer('Player2');
    const gameState = createMockPlayingStateWithoutGenre({
      [host.id]: host,
      [player.id]: player,
    });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
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

    await page.goto(`/room/${gameState.id}`);

    await expect(page.getByTestId(`player-name-${host.name}`)).toBeVisible();
    await expect(page.getByTestId('kick-player')).not.toBeVisible();
  });

  test('shows the game-over screen when the room finishes without a winner', async ({ page }) => {
    const host = createMockProducer('HostPlayer', {
      scoreInfo: createMockScoreInfo(90, 1),
    });
    const gameState = createMockFinishedState({ [host.id]: host }, null, 1);

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: host,
        playerSecret: 'host-secret',
      },
    });

    await setupPlayerSession(page, {
      playerName: host.name,
      playerId: host.id,
      playerSecret: 'host-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    await expect(page.getByTestId('game-over-screen')).toBeVisible();
    await expect(page.getByTestId('play-again')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import {
  createMockPlayingState,
  createMockProducer,
  toRoomResponse,
} from './utils/game-fixtures';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';

const emptyHeatmap = [
  'ambient',
  'drill',
  'edm',
  'house',
  'jazz',
  'lofi',
  'phonk',
  'rnb',
  'trap',
].map(genre => ({
  genre,
  wins: 0,
  total_rounds: 0,
  win_rate: 0,
  grade: 'N/A' as const,
}));

test.describe('Producer titles', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('renders title badges in leaderboard and player profile', async ({ page }) => {
    const jackpot = createMockProducer('Jackpot Producer', {
      eloRating: 1400,
      currentTitle: 'JACKPOT',
    });
    const checkedIn = createMockProducer('Checked Producer', {
      eloRating: 1300,
      isCheckedIn: true,
      currentTitle: 'CHECKED_IN',
    });
    const gameState = createMockPlayingState({ [jackpot.id]: jackpot, [checkedIn.id]: checkedIn });

    await setupPlayerSession(page, {
      playerName: jackpot.name,
      playerId: jackpot.id,
      playerSecret: 'jackpot-secret',
    });
    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: jackpot, playerSecret: 'jackpot-secret' },
      players: [jackpot, checkedIn],
      genrePerformance: {
        [jackpot.id]: emptyHeatmap,
        [checkedIn.id]: emptyHeatmap,
      },
    });

    await page.goto('/leaderboard');
    await expect(page.getByLabel('Jackpot title').first()).toBeVisible();
    await expect(page.getByLabel('Checked In title').first()).toBeVisible();

    await page.goto(`/room/${gameState.id}`);
    await page.getByTestId(`player-name-${jackpot.name}`).click();
    await expect(page.getByTestId('player-profile-modal')).toBeVisible();
    await expect(page.getByLabel('Jackpot title').first()).toBeVisible();
  });

  test('admin can toggle Checked In status', async ({ page }) => {
    const player = createMockProducer('Admin Target', {
      eloRating: 1200,
      isCheckedIn: false,
      currentTitle: 'NONE',
    });
    const checkedInPlayer = {
      ...player,
      isCheckedIn: true,
      currentTitle: 'CHECKED_IN' as const,
    };

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(createMockPlayingState({ [player.id]: player })),
      players: [player],
      setCheckedIn: async route => {
        await route.fulfill({
          status: 200,
          json: {
            id: checkedInPlayer.id,
            name: checkedInPlayer.name,
            is_checked_in: true,
            current_title: 'CHECKED_IN',
            elo_rating: checkedInPlayer.eloRating,
            is_spectator: false,
            tiles: [],
          },
        });
      },
    });

    await page.goto('/admin/players');
    await page.getByLabel('Admin PIN').fill('9619');
    await page.getByRole('button', { name: 'Unlock Player Admin' }).click();
    await expect(page.getByText('Admin Target')).toBeVisible();
    await page.getByRole('button', { name: 'Check In', exact: true }).click();
    await expect(page.getByLabel('Checked In title')).toBeVisible();
  });

  test('ranked title and ELO results render in match surfaces', async ({ page }) => {
    const sweeper = createMockProducer('Sweeper Winner', {
      eloRating: 1260,
      currentTitle: 'SWEEPER',
      eloWins: 3,
      eloLosses: 0,
      eloMatches: 3,
    });
    const loser = createMockProducer('Penalty Loser', {
      eloRating: 1120,
      eloWins: 0,
      eloLosses: 3,
      eloMatches: 3,
    });
    const gameState = createMockPlayingState({ [sweeper.id]: sweeper, [loser.id]: loser });

    await setupPlayerSession(page, {
      playerName: sweeper.name,
      playerId: sweeper.id,
      playerSecret: 'sweeper-secret',
    });
    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: sweeper, playerSecret: 'sweeper-secret' },
    });

    await page.goto(`/room/${gameState.id}`);
    await expect(page.getByLabel('Sweeper title').first()).toBeVisible();
    await expect(page.getByTestId(`player-elo-stats-${sweeper.id}`)).toHaveText('ELO: 1260 · 3W / 0L / 3M');
    await expect(page.getByTestId(`player-elo-stats-${loser.id}`)).toHaveText('ELO: 1120 · 0W / 3L / 3M');
  });
});

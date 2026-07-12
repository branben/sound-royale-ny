import { test, expect } from '@playwright/test';
import { createMockPlayingState, createMockProducer, toRoomResponse } from './utils/game-fixtures';
import { enableE2EMode, mockApiRoutes, setupPlayerSession } from './helpers';

const fullGenrePerformance = [
  { genre: 'ambient', wins: 0, total_rounds: 0, win_rate: 0, grade: 'N/A' as const },
  { genre: 'drill', wins: 0, total_rounds: 1, win_rate: 0, grade: 'F' as const },
  { genre: 'edm', wins: 2, total_rounds: 5, win_rate: 40, grade: 'D' as const },
  { genre: 'house', wins: 1, total_rounds: 2, win_rate: 50, grade: 'C' as const },
  { genre: 'jazz', wins: 6, total_rounds: 10, win_rate: 60, grade: 'B' as const },
  { genre: 'lofi', wins: 7, total_rounds: 10, win_rate: 70, grade: 'A' as const },
  { genre: 'phonk', wins: 8, total_rounds: 10, win_rate: 80, grade: 'S' as const },
  { genre: 'rnb', wins: 3, total_rounds: 10, win_rate: 30, grade: 'E' as const },
  { genre: 'trap', wins: 0, total_rounds: 0, win_rate: 0, grade: 'N/A' as const },
];

test.describe('Genre heatmap leaderboard', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('opens leaderboard from lobby and renders players sorted by ELO with genre summary', async ({
    page,
  }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const champion = createMockProducer('Champion', {
      eloRating: 1500,
      eloWins: 9,
      eloLosses: 1,
      eloMatches: 10,
    });
    const contender = createMockProducer('Contender', {
      eloRating: 1250,
      eloWins: 4,
      eloLosses: 3,
      eloMatches: 7,
    });
    const roomResponse = toRoomResponse(
      createMockPlayingState({ [champion.id]: champion, [contender.id]: contender }),
    );

    await setupPlayerSession(page, {
      playerName: champion.name,
      playerId: champion.id,
      playerSecret: 'champion-secret',
    });
    await mockApiRoutes(page, {
      roomResponse,
      players: [contender, champion],
      genrePerformance: {
        [champion.id]: fullGenrePerformance,
        [contender.id]: [],
      },
    });

    await page.goto('/');
    await page.getByRole('link', { name: /view leaderboard/i }).click();

    await expect(page).toHaveURL(/\/leaderboard$/);
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
    await expect(page.getByText('Top Genres').first()).toBeVisible();
    await expect(page.getByText('Champion')).toBeVisible();
    await expect(page.getByText('Contender')).toBeVisible();
    // Top genres summary should be visible (shows top 3 genres with grades)
    await expect(page.getByText('phonk')).toBeVisible();
    await expect(page.getByTestId('genre-grade-phonk')).toBeVisible();
  });

  test('renders the radar chart in the player profile modal', async ({ page }) => {
    const producer = createMockProducer('Profile Producer', { eloRating: 1330 });
    const opponent = createMockProducer('Opponent', { eloRating: 1210 });
    const gameState = createMockPlayingState({ [producer.id]: producer, [opponent.id]: opponent });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'producer-secret',
    });
    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: producer, playerSecret: 'producer-secret' },
      genrePerformance: {
        [producer.id]: fullGenrePerformance,
      },
    });

    await page.goto(`/room/${gameState.id}`);
    await page.getByTestId(`player-name-${producer.name}`).click();

    await expect(page.getByTestId('player-profile-modal')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Genre Performance' })).toBeVisible();
    // Radar chart should be visible (recharts renders SVG elements)
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible();
  });

  test.skip('radar chart displays legacy genre with label [needs update - room genres filter]', async ({
    page,
  }) => {
    // This test is skipped because when viewing a player profile from a room,
    // the radar chart now filters to only the room's genres, so legacy labels
    // won't be shown in that context. The legacy genre display is still
    // available when viewing a player from the leaderboard (no room genres).
  });
});

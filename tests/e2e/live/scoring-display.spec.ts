import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('Scoring Display', () => {
  test.setTimeout(90000);

  test('score display shows base points, bonuses, and completed lines', async ({
    page,
    request,
  }) => {
    // Create a room via API
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();
    expect(room.room_code).toBeTruthy();

    // Finished game state with scores
    const finishedGameState = {
      id: room.room_code,
      status: 'finished',
      match_type: 'casual',
      current_round: 9,
      winner: room.player_id,
      players: {
        [room.player_id]: {
          id: room.player_id,
          name: 'TestHost',
          is_host: true,
          is_spectator: false,
          is_connected: true,
          board: { tiles: [] },
          score_info: {
            score: 400,
            base_score: 300,
            bonuses: [{ type: 'multi_line', points: 100 }],
            lines: [{ type: 'horizontal', positions: [0, 1, 2] }],
          },
          elo_rating: 1280,
        },
      },
      round_state: {
        voting_open: false,
        timer_running: false,
      },
      spectator_count: 0,
    };

    // Mock the game_state endpoint (used by GameContext for real-time state)
    await page.route(`**/api/rooms/${room.room_code}/game_state/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(finishedGameState),
      });
    });

    // Mock the room detail endpoint (used by Room.tsx fetchRoom)
    await page.route(`**/api/rooms/${room.room_code}/`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: room.room_code,
            code: room.room_code,
            status: 'finished',
            match_type: 'casual',
            current_round: 9,
            players: [
              {
                id: room.player_id,
                name: 'TestHost',
                is_host: true,
                is_spectator: false,
                is_connected: true,
                score_info: {
                  score: 400,
                  base_score: 300,
                  bonuses: [{ type: 'multi_line', points: 100 }],
                  lines: [{ type: 'horizontal', positions: [0, 1, 2] }],
                },
                elo_rating: 1280,
              },
            ],
            winner: room.player_id,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to room page
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
    await page.goto(`/room/${room.room_code}`);

    // Verify score display is visible
    const scoreDisplay = page.locator('[data-testid="score-display"]').first();
    await expect(scoreDisplay).toBeVisible({ timeout: 10000 });

    // Verify total score is shown
    const totalScore = page.locator('[data-testid="score-display"] .text-3xl').first();
    await expect(totalScore).toBeVisible({ timeout: 10000 });

    // Verify base score breakdown is shown
    const baseScore = page.locator('text=/Base Score/i').first();
    await expect(baseScore).toBeVisible({ timeout: 10000 });

    // Verify bonus is shown
    const bonus = page.locator('text=/Multi Line Bonus/i').first();
    await expect(bonus).toBeVisible({ timeout: 10000 });

    // Verify ELO rating is shown
    const eloDisplay = page.locator('[data-testid="elo-rating"]').first();
    await expect(eloDisplay).toBeVisible({ timeout: 10000 });
  });
});

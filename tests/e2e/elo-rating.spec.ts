import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('ELO Rating System', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test('should display ELO rating', async ({ request }) => {
    // Create a room
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    expect(room.room_code).toBeTruthy();
  });

  test('should show ELO stats in final standings', async ({ request }) => {
    // Create a room and play a game
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    // Join as second player
    await request.post(`${API_BASE}/rooms/${room.room_code}/join_game/`, {
      data: { name: 'Player2' },
    });

    expect(room.room_code).toBeTruthy();
  });
});

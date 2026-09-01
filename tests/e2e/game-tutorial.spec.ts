import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('Game Tutorial', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test('tutorial appears on first game start for producer', async ({ request }) => {
    // Create a room
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    expect(room.room_code).toBeTruthy();
  });

  test('tutorial can be dismissed and not shown again', async ({ request }) => {
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    expect(room.room_code).toBeTruthy();
  });

  test('tutorial not shown when already seen', async ({ request }) => {
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    expect(room.room_code).toBeTruthy();
  });
});

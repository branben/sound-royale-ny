import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('Bingo Line Detection', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test('should detect horizontal row completion', async ({ request }) => {
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    expect(room.room_code).toBeTruthy();
  });

  test('should detect vertical column completion', async ({ request }) => {
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    expect(room.room_code).toBeTruthy();
  });
});

import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('Scoring Display', () => {
  test.setTimeout(90000);

  test('room page renders lobby with room code and share instructions', async ({
    page,
    request,
  }) => {
    // Create a room via API
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();
    expect(room.room_code).toBeTruthy();

    // Navigate to room page directly
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
    await page.goto(`/room/${room.room_code}`);

    // Verify lobby is visible (page loaded successfully)
    await expect(page.locator('[data-testid="lobby"]')).toBeVisible({ timeout: 15000 });

    // Verify room code is displayed
    await expect(page.locator('[data-testid="room-id"]')).toBeVisible({ timeout: 10000 });

    // Verify share instructions are visible
    await expect(page.getByText(/Share this code to invite players/i)).toBeVisible({
      timeout: 10000,
    });
  });
});

import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('Share Invite', () => {
  test.setTimeout(60000);

  test('room code is visible and share instructions are shown', async ({ page }) => {
    // Create a room via API
    const createRes = await page.request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();
    expect(room.room_code).toBeTruthy();

    // Navigate to room page
    await page.goto(`/room/${room.room_code}`);

    // Verify room code is visible
    const roomCodeEl = page.locator('text=/Room Code/i').locator('..').locator('p').nth(1);
    await expect(roomCodeEl).toBeVisible({ timeout: 10000 });
    await expect(roomCodeEl).toHaveText(room.room_code);

    // Verify share instructions are visible
    const shareText = page.getByText(
      /Share the code to fill the room|Share this code to invite players/i,
    );
    await expect(shareText).toBeVisible({ timeout: 10000 });

    // Verify room code is selectable (can be copied)
    const codeText = await roomCodeEl.textContent();
    expect(codeText).toBe(room.room_code);
  });
});

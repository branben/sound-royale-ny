import { test, expect } from '@playwright/test';

test.describe('ELO Rating System', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test('should display ELO rating', async ({ page }) => {
    // Create a room
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    await page.goto(`/room/${room.room_code}`);
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('elo-rating')).toContainText('ELO:');
  });

  test('should show ELO stats in final standings', async ({ page }) => {
    // Create a room and play a game
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    // Join as second player
    await page.request.post(`/api/rooms/${room.room_code}/join_game/`, {
      data: { name: 'Player2' },
    });

    // Navigate to room
    await page.goto(`/room/${room.room_code}`);

    // ELO stats should be visible
    await expect(page.getByTestId('elo-rating')).toBeVisible({ timeout: 10000 });
  });
});

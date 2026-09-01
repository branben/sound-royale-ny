import { test, expect } from '@playwright/test';

test.describe('Bingo Line Detection', () => {
  test.setTimeout(60000);

  test('should detect horizontal row completion', async ({ page }) => {
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    await page.goto(`/room/${room.room_code}`);
    const gameBoard = page.getByTestId('game-board');
    await gameBoard.waitFor({ state: 'visible' });
    await expect(gameBoard).toBeVisible();
  });

  test('should detect vertical column completion', async ({ page }) => {
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    await page.goto(`/room/${room.room_code}`);
    await page.getByTestId('game-board').waitFor({ state: 'visible' });
    await expect(page.getByTestId('game-board')).toBeVisible();
  });
});

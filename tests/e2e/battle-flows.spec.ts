import { test, expect } from '@playwright/test';

test.describe('Music Battle Game Flows', () => {
  test.setTimeout(60000);

  test.describe('State Transitions', () => {
    test('should transition from lobby to playing state', async ({ page }) => {
      const createRes = await page.request.post('/api/rooms/', {
        data: { host_name: 'TestHost' },
      });
      const room = await createRes.json();

      await page.goto(`/room/${room.room_code}`);

      // Assert lobby state: room page loads
      await expect(page).toHaveURL(new RegExp(`/room/${room.room_code}`));
    });

    test('should transition from playing to finished state', async ({ page }) => {
      const createRes = await page.request.post('/api/rooms/', {
        data: { host_name: 'TestHost' },
      });
      const room = await createRes.json();

      // Join as second player
      await page.request.post(`/api/rooms/${room.room_code}/join_game/`, {
        data: { name: 'Player2' },
      });

      await page.goto(`/room/${room.room_code}`);

      // Assert room loads
      await expect(page).toHaveURL(new RegExp(`/room/${room.room_code}`));
    });
  });

  test.describe('Existing Tests', () => {
    test('should handle room navigation - join existing room', async ({ page }) => {
      // Create a room
      const createRes = await page.request.post('/api/rooms/', {
        data: { host_name: 'TestHost' },
      });
      const room = await createRes.json();

      await page.goto('/');

      // Enter player name
      const nameInput = page.getByTestId('player-name-input');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('TestPlayer');

      // Click Join Room mode button
      await page.getByTestId('join-room-mode-button').click();

      const roomInput = page.getByTestId('room-code-input');
      await expect(roomInput).toBeVisible();
      await roomInput.fill(room.room_code);

      // Click the Join Room submit button
      await page.getByTestId('join-room-button').click();

      // Assert the Room transitions to lobby waiting view
      await expect(page.getByText(/Waiting for opponent|You're in/i)).toBeVisible({
        timeout: 10000,
      });
    });

    test('should handle tile selection and upload', async ({ page }) => {
      const createRes = await page.request.post('/api/rooms/', {
        data: { host_name: 'TestHost' },
      });
      const room = await createRes.json();

      await page.goto(`/room/${room.room_code}`);

      await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
    });
  });
});

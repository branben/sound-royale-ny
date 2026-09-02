import { test, expect } from '@playwright/test';
import { getGameState } from './live/helpers';

test.describe('Lobby', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    // Dismiss onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
  });

  test('renders lobby container with correct heading', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('lobby')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('SOUND ROYALE');
    await expect(
      page.getByText('Multiplayer music bingo. Upload beats, claim tiles, win the round.'),
    ).toBeVisible();
  });

  test('room code input accepts only digits', async ({ page }) => {
    await page.goto('/');

    // Enter player name first
    await page.getByTestId('player-name-input').fill('TestPlayer');
    await page.waitForTimeout(100);

    // Switch to join mode
    await page.getByTestId('join-room-mode-button').click();

    const input = page.getByTestId('room-code-input');
    await expect(input).toBeVisible();

    await input.click();
    await input.pressSequentially('abcd');
    await expect(input).toHaveValue('');

    await input.clear();
    await input.pressSequentially('12ab');
    await expect(input).toHaveValue('12');
  });

  test('room code input is capped at 4 digits', async ({ page }) => {
    await page.goto('/');

    // Enter player name first
    await page.getByTestId('player-name-input').fill('TestPlayer');
    await page.waitForTimeout(100);

    // Switch to join mode
    await page.getByTestId('join-room-mode-button').click();

    const input = page.getByTestId('room-code-input');
    await input.click();
    await input.pressSequentially('123456');
    await expect(input).toHaveValue('1234');
  });

  test('join button is disabled until exactly 4 digits entered', async ({ page }) => {
    await page.goto('/');

    // Enter player name first
    await page.getByTestId('player-name-input').fill('TestPlayer');
    await page.waitForTimeout(100);

    // Switch to join mode
    await page.getByTestId('join-room-mode-button').click();

    const input = page.getByTestId('room-code-input');
    const joinBtn = page.getByTestId('join-room-button');

    await expect(joinBtn).toBeDisabled();

    await input.click();
    await input.pressSequentially('123');
    await expect(joinBtn).toBeDisabled();

    await input.clear();
    await input.pressSequentially('1234');
    await expect(joinBtn).toBeEnabled();
  });

  test('clearing room code re-disables the join button', async ({ page }) => {
    await page.goto('/');

    // Enter player name first
    await page.getByTestId('player-name-input').fill('TestPlayer');
    await page.waitForTimeout(100);

    // Switch to join mode
    await page.getByTestId('join-room-mode-button').click();

    const input = page.getByTestId('room-code-input');
    const joinBtn = page.getByTestId('join-room-button');

    await input.click();
    await input.pressSequentially('1234');
    await expect(joinBtn).toBeEnabled();

    await input.clear();
    await expect(joinBtn).toBeDisabled();
  });

  test('joining a room navigates to the room page', async ({ page }) => {
    // Create a real room via API
    const createRes = await page.request.post('/api/rooms/', {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();

    await page.goto('/');

    // Enter player name first
    await page.getByTestId('player-name-input').fill('TestPlayer');
    await page.waitForTimeout(100);

    // Switch to join mode
    await page.getByTestId('join-room-mode-button').click();

    const input = page.getByTestId('room-code-input');
    await input.fill(room.room_code);

    await page.getByTestId('join-room-button').click();

    // Poll API until player is registered in the room (WebSocket state can lag).
    await expect
      .poll(
        async () => {
          try {
            const state = await getGameState(room.room_code);
            return Object.keys(state.players || {}).length;
          } catch {
            return 0;
          }
        },
        { timeout: 15000, intervals: [500, 1000, 2000] },
      )
      .toBe(2);

    // Should navigate to room page
    await expect(page).toHaveURL(new RegExp(`/room/${room.room_code}`));
  });
});

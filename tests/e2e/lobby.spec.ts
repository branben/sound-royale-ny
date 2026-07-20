import { test, expect } from '@playwright/test';
import { enableE2EMode, setupPlayerSession } from './helpers';

test.describe('Lobby', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    // Set hasSeenOnboarding before page loads so the onboarding modal never appears
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });
    await setupPlayerSession(page, {
      playerName: 'TestPlayer',
      playerId: 'test-id',
      playerSecret: 'test-secret',
    });
    await page.goto('/');
  });

  test('renders lobby container with correct heading', async ({ page }) => {
    await expect(page.getByTestId('lobby')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('SOUND ROYALE');
    await expect(
      page.getByText('Multiplayer music bingo. Upload beats, claim tiles, win the round.'),
    ).toBeVisible();
  });

  test('room code input accepts only digits', async ({ page }) => {
    const input = page.getByTestId('room-code-input');
    await expect(input).toBeVisible();

    // Use pressSequentially to simulate keystrokes that trigger onChange properly
    await input.click();
    await input.pressSequentially('abcd');
    await expect(input).toHaveValue('');

    await input.clear();
    await input.pressSequentially('12ab');
    await expect(input).toHaveValue('12');
  });

  test('room code input is capped at 4 digits', async ({ page }) => {
    const input = page.getByTestId('room-code-input');
    await expect(input).toBeVisible();

    await input.click();
    await input.pressSequentially('123456');
    await expect(input).toHaveValue('1234');
  });

  test('join button is disabled until exactly 4 digits entered', async ({ page }) => {
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
    const input = page.getByTestId('room-code-input');
    const joinBtn = page.getByTestId('join-room-button');

    await input.click();
    await input.pressSequentially('1234');
    await expect(joinBtn).toBeEnabled();

    await input.clear();
    await expect(joinBtn).toBeDisabled();
  });

  test('joining a room navigates to the room page', async ({ page }) => {
    let joinRequestBody: any = null;

    // Mock the room lookup (handleJoin calls getRoom first)
    await page.route('**/api/rooms/1234/', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            code: '1234',
            status: 'lobby',
            current_round: 0,
            players: [],
          },
        });
      } else {
        await route.continue();
      }
    });

    // Mock the join_game endpoint
    await page.route('**/api/rooms/1234/join_game/', async (route) => {
      joinRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        json: {
          id: 'player-2',
          name: 'TestPlayer',
          is_host: false,
          is_spectator: false,
          player_secret: 'player-2-secret',
        },
      });
    });

    // Type room code character by character to trigger React onChange
    const roomCodeInput = page.getByTestId('room-code-input');
    await roomCodeInput.click();
    await roomCodeInput.pressSequentially('1234');

    // Wait for the join button to be enabled (4 digits entered)
    const joinBtn = page.getByTestId('join-room-button');
    await expect(joinBtn).toBeEnabled();
    await joinBtn.click();

    // Wait for navigation to the room page
    await expect(page).toHaveURL('/room/1234');

    // Verify the join API was called
    expect(joinRequestBody).not.toBeNull();
    expect(joinRequestBody).toHaveProperty('name');
  });
});

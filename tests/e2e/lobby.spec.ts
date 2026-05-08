import { test, expect } from '@playwright/test';
import { enableE2EMode, setupPlayerSession } from './helpers';

test.describe('Lobby', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await setupPlayerSession(page, { playerName: 'TestPlayer', playerId: 'test-id', playerSecret: 'test-secret' });
    await page.goto('/');
  });

  test('renders lobby container with correct heading', async ({ page }) => {
    await expect(page.getByTestId('lobby')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sound Royale' })).toBeVisible();
    await expect(page.getByText('Enter a room code to join the battle')).toBeVisible();
  });

  test('room code input accepts only digits', async ({ page }) => {
    const input = page.getByTestId('room-code-input');

    await input.fill('abcd');
    await expect(input).toHaveValue('');

    await input.fill('12ab');
    await expect(input).toHaveValue('12');
  });

  test('room code input is capped at 4 digits', async ({ page }) => {
    const input = page.getByTestId('room-code-input');

    await input.fill('123456');
    await expect(input).toHaveValue('1234');
  });

  test('join button is disabled until exactly 4 digits entered', async ({ page }) => {
    const input = page.getByTestId('room-code-input');
    const joinBtn = page.getByTestId('join-room-button');

    await expect(joinBtn).toBeDisabled();

    await input.fill('123');
    await expect(joinBtn).toBeDisabled();

    await input.fill('1234');
    await expect(joinBtn).toBeEnabled();
  });

  test('clearing room code re-disables the join button', async ({ page }) => {
    const input = page.getByTestId('room-code-input');
    const joinBtn = page.getByTestId('join-room-button');

    await input.fill('1234');
    await expect(joinBtn).toBeEnabled();

    await input.fill('');
    await expect(joinBtn).toBeDisabled();
  });

  test('second producer ready click posts room-scoped credentials and updates browser state', async ({ page }) => {
    let isReady = false;
    let readyRequestBody: Record<string, unknown> | null = null;

    await page.route('**/api/rooms/1234/join_game/', async (route) => {
      await route.fulfill({
        status: 201,
        json: {
          id: 'player-2',
          player_name: 'Second Producer',
          is_spectator: false,
          player_secret: 'player-2-secret',
        },
      });
    });

    await page.route('**/api/rooms/1234/toggle_ready/', async (route) => {
      readyRequestBody = route.request().postDataJSON();
      isReady = true;

      await route.fulfill({
        status: 200,
        json: {
          player_id: 'player-2',
          is_ready: true,
        },
      });
    });

    await page.route('**/api/rooms/1234/', async (route) => {
      await route.fulfill({
        json: {
          code: '1234',
          status: 'lobby',
          current_round: 0,
          players: [
            {
              id: 'host-1',
              name: 'Host Producer',
              is_host: true,
              is_ready: false,
              is_connected: true,
              is_spectator: false,
              tiles: [],
            },
            {
              id: 'player-2',
              name: 'Second Producer',
              is_host: false,
              is_ready: isReady,
              is_connected: true,
              is_spectator: false,
              tiles: [],
            },
          ],
        },
      });
    });

    await page.getByTestId('player-name-input').fill('Second Producer');
    await page.getByTestId('room-code-input').fill('1234');
    await page.getByTestId('join-room-button').click();

    await expect(page.getByRole('button', { name: 'Click When Ready' })).toBeVisible();
    await expect(page.getByText('Not Ready')).toBeVisible();

    await page.getByRole('button', { name: 'Click When Ready' }).click();

    expect(readyRequestBody).toEqual({
      player_id: 'player-2',
      player_secret: 'player-2-secret',
    });
    await expect(page.getByRole('button', { name: "✓ I'm Ready!" })).toBeVisible();
    await expect(page.getByText('✓ Ready')).toBeVisible();
  });
});

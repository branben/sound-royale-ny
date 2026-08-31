import { test, expect, Page, Locator } from '@playwright/test';

/**
 * Visual dogfooding — captures screenshots of every page for review.
 * These tests verify pages render correctly and capture visual state.
 */

// Helper to capture a full-page screenshot
async function capture(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/visual/${name}.png`,
    fullPage: true,
  });
}

// Helper to wait for page to stabilize
async function waitForStable(page: Page) {
  // Wait for network to be idle
  await page.waitForLoadState('networkidle');
  // Wait a bit for animations
  await page.waitForTimeout(500);
}

test.describe('Visual: Public Pages', () => {
  test('lobby page renders correctly', async ({ page }) => {
    await page.goto('/');
    await waitForStable(page);
    await expect(page.locator('h1')).toBeVisible();
    await capture(page, '01-lobby');
  });

  test('leaderboard page renders correctly', async ({ page }) => {
    await page.goto('/leaderboard');
    await waitForStable(page);
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
    await capture(page, '02-leaderboard');
  });

  test('admin theme page renders correctly', async ({ page }) => {
    await page.goto('/admin/themes');
    await waitForStable(page);
    await expect(page.locator('#theme-admin-pin')).toBeVisible();
    await capture(page, '03-admin-theme');
  });

  test('admin player page renders correctly', async ({ page }) => {
    await page.goto('/admin/players');
    await waitForStable(page);
    await expect(page.locator('#player-admin-pin')).toBeVisible();
    await capture(page, '04-admin-player');
  });

  test('404 page renders correctly', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await waitForStable(page);
    await capture(page, '05-404');
  });
});

test.describe('Visual: Authenticated Flow', () => {
  test('create room flow', async ({ page, request }) => {
    // Create room via API
    const res = await request.post('https://sound-royale-ny.fly.dev/api/rooms/', {
      data: { host_name: 'VisualTest', match_type: 'casual' },
    });
    const { room_code } = await res.json();

    // Navigate to room
    await page.goto(`/room/${room_code}`);
    await waitForStable(page);

    // Should show game board or lobby
    const gameBoard = page.locator('[data-testid="game-board"]');
    const lobby = page.locator('h1');

    if (await gameBoard.isVisible().catch(() => false)) {
      await capture(page, '06-room-game-board');
    } else if (await lobby.isVisible().catch(() => false)) {
      await capture(page, '06-room-lobby');
    }
  });

  test('join room flow', async ({ page, request }) => {
    // Create room
    const createRes = await request.post('https://sound-royale-ny.fly.dev/api/rooms/', {
      data: { host_name: 'Host', match_type: 'casual' },
    });
    const { room_code } = await createRes.json();

    // Navigate to join
    await page.goto(`/?room=${room_code}`);
    await waitForStable(page);

    // Should show join form
    const joinInput = page.locator('input[placeholder*="room" i], input[name="room"]');
    if (await joinInput.isVisible().catch(() => false)) {
      await capture(page, '07-join-form');
    }
  });
});

test.describe('Visual: Mobile Viewports', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('lobby mobile', async ({ page }) => {
    await page.goto('/');
    await waitForStable(page);
    await capture(page, '08-lobby-mobile');
  });

  test('leaderboard mobile', async ({ page }) => {
    await page.goto('/leaderboard');
    await waitForStable(page);
    await capture(page, '09-leaderboard-mobile');
  });
});

test.describe('Visual: Admin Flow', () => {
  test('theme admin with PIN', async ({ page }) => {
    await page.goto('/admin/themes');
    await waitForStable(page);

    // Enter PIN
    const pinInput = page.locator('#theme-admin-pin');
    await pinInput.fill('admin-secret');

    // Click unlock
    const unlockBtn = page.getByRole('button', { name: /unlock|submit|verify|enter/i });
    if (await unlockBtn.isVisible().catch(() => false)) {
      await unlockBtn.click();
      await waitForStable(page);
      await capture(page, '10-admin-theme-unlocked');
    }
  });
});

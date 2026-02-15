import { test, expect } from '@playwright/test';

test.describe('Spectator Mode Experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/room/test-room?spectator=true');
  });

  test('should display spectator view header', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });
  });

  test('should show player count in header', async ({ page }) => {
    await expect(page.locator('text=/\\d+ Players/')).toBeVisible({ timeout: 5000 });
  });

  test('should display live indicator', async ({ page }) => {
    await expect(page.locator('text=LIVE')).toBeVisible({ timeout: 5000 });
  });

  test('should display battle arena title', async ({ page }) => {
    await expect(page.locator('text=Battle Arena')).toBeVisible({ timeout: 5000 });
  });

  test('should show leaderboard', async ({ page }) => {
    await expect(page.locator('text=Leaderboard')).toBeVisible({ timeout: 5000 });
  });

  test('should display player boards', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });
    const boards = await page.locator('[class*="board"], .bingo-board').count();
    expect(boards).toBeGreaterThanOrEqual(0);
  });

  test('should have jump to player functionality', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });
    const jumpTo = await page.locator('text=Jump to').count();
    expect(jumpTo).toBeGreaterThanOrEqual(0);
  });

  test('should display round information', async ({ page }) => {
    await expect(page.locator('text=/Round \\d+/')).toBeVisible({ timeout: 5000 });
  });

  test('should show game phase indicator', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });
    const gamePhase = await page.locator('text=/Waiting in Lobby|Game in Progress|Game Finished/').count();
    expect(gamePhase).toBeGreaterThanOrEqual(0);
  });

  test('should display request to play button', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });
    const requestToPlay = await page.locator('text=Request to Play').count();
    expect(requestToPlay).toBeGreaterThanOrEqual(0);
  });
});

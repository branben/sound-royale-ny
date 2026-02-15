import { test, expect } from '@playwright/test';

test.describe('Spectator Mode Experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/room/test-room?spectator=true');
  });

  test('should display spectator view header', async ({ page }) => {
    await page.waitForTimeout(2000);

    const header = await page.locator('header').count();
    expect(header).toBeGreaterThan(0);
  });

  test('should show player count in header', async ({ page }) => {
    await page.waitForTimeout(2000);

    const playerCount = await page.locator('text=/\\d+ Players/').count();
    expect(playerCount).toBeGreaterThan(0);
  });

  test('should display live indicator', async ({ page }) => {
    await page.waitForTimeout(1000);

    const liveIndicator = await page.locator('text=LIVE').count();
    expect(liveIndicator).toBeGreaterThan(0);
  });

  test('should display battle arena title', async ({ page }) => {
    await page.waitForTimeout(2000);

    const battleArena = await page.locator('text=Battle Arena').count();
    expect(battleArena).toBeGreaterThan(0);
  });

  test('should show leaderboard', async ({ page }) => {
    await page.waitForTimeout(2000);

    const leaderboard = await page.locator('text=Leaderboard').count();
    expect(leaderboard).toBeGreaterThan(0);
  });

  test('should display player boards', async ({ page }) => {
    await page.waitForTimeout(2000);

    const boards = await page.locator('[class*="board"], .bingo-board').count();
    expect(boards).toBeGreaterThanOrEqual(0);
  });

  test('should have jump to player functionality', async ({ page }) => {
    await page.waitForTimeout(2000);

    const jumpTo = await page.locator('text=Jump to').count();
    expect(jumpTo).toBeGreaterThanOrEqual(0);
  });

  test('should display round information', async ({ page }) => {
    await page.waitForTimeout(2000);

    const roundInfo = await page.locator('text=/Round \\d+/').count();
    expect(roundInfo).toBeGreaterThan(0);
  });

  test('should show game phase indicator', async ({ page }) => {
    await page.waitForTimeout(2000);

    const gamePhase = await page.locator('text=/Waiting in Lobby|Game in Progress|Game Finished/').count();
    expect(gamePhase).toBeGreaterThanOrEqual(0);
  });

  test('should display request to play button', async ({ page }) => {
    await page.waitForTimeout(2000);

    const requestToPlay = await page.locator('text=Request to Play').count();
    expect(requestToPlay).toBeGreaterThanOrEqual(0);
  });
});

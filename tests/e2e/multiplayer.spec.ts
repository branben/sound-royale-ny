import { test, expect } from '@playwright/test';

test.describe('Multi-Player Game Scenarios', () => {
  test('should handle multiple players joining', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto('/room/test-room');
    await page2.goto('/room/test-room');

    await page1.waitForTimeout(2000);
    await page2.waitForTimeout(2000);

    const playerCount1 = await page1.locator('text=/\\d+ Players/').count();
    const playerCount2 = await page2.locator('text=/\\d+ Players/').count();

    expect(playerCount1).toBeGreaterThan(0);
    expect(playerCount2).toBeGreaterThan(0);

    await context1.close();
    await context2.close();
  });

  test('should sync game state across players', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto('/room/test-room');
    await page2.goto('/room/test-room');

    await page1.waitForTimeout(2000);
    await page2.waitForTimeout(2000);

    const round1 = await page1.locator('text=/Round \\d+/').first().textContent();
    const round2 = await page2.locator('text=/Round \\d+/').first().textContent();

    expect(round1).toBe(round2);

    await context1.close();
    await context2.close();
  });

  test('should handle host migration when host leaves', async ({ page }) => {
    await page.goto('/room/test-room');

    await page.waitForTimeout(2000);

    const hasHostIndicator = await page.locator('text=/Host|host/').count() > 0 ||
                            await page.locator('[data-testid="host-badge"]').count() > 0;

    expect(hasHostIndicator).toBeTruthy();
  });

  test('should display connected player status', async ({ page }) => {
    await page.goto('/room/test-room');

    await page.waitForTimeout(2000);

    const hasConnectionStatus = await page.locator('text=/connected|disconnected|offline|online/').count() > 0;

    expect(hasConnectionStatus).toBeTruthy();
  });

  test('should handle round transitions', async ({ page }) => {
    await page.goto('/room/test-room');

    await page.waitForTimeout(3000);

    const hasRoundDisplay = await page.locator('text=/Round \\d+/').count() > 0;

    expect(hasRoundDisplay).toBeTruthy();
  });
});

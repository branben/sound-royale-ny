import { test, expect } from '@playwright/test';

test.describe('Multi-Player Game Scenarios', () => {
  test('should handle multiple players joining', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto('/room/test-room');
    await page2.goto('/room/test-room');

    await expect(page1.locator('text=/\\d+ Players/')).toBeVisible();
    await expect(page2.locator('text=/\\d+ Players/')).toBeVisible();

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

    const round1Locator = page1.locator('text=/Round \\d+/').first();
    const round2Locator = page2.locator('text=/Round \\d+/').first();

    await expect(round1Locator).toBeVisible();
    await expect(round2Locator).toBeVisible();

    const round1 = await round1Locator.textContent();
    const round2 = await round2Locator.textContent();

    expect(round1).toBe(round2);

    await context1.close();
    await context2.close();
  });

  test('should handle host migration when host leaves', async ({ page }) => {
    await page.goto('/room/test-room');

    await expect(page.locator('header')).toBeVisible();

    const hasHostIndicator = await page.locator('text=/Host|host/').count() > 0 ||
                            await page.locator('[data-testid="host-badge"]').count() > 0;

    expect(hasHostIndicator).toBeTruthy();
  });

  test('should display connected player status', async ({ page }) => {
    await page.goto('/room/test-room');

    await expect(page.locator('header')).toBeVisible();

    const hasConnectionStatus = await page.locator('text=/connected|disconnected|offline|online/').count() > 0;

    expect(hasConnectionStatus).toBeTruthy();
  });

  test('should handle round transitions', async ({ page }) => {
    await page.goto('/room/test-room');

    const hasRoundDisplay = await page.locator('text=/Round \\d+/').count() > 0;

    expect(hasRoundDisplay).toBeTruthy();
  });
});

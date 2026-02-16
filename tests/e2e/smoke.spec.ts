import { test, expect } from '@playwright/test';

test.describe('Basic User Flow', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
    });
    page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.goto('/');
    await expect(page).toHaveTitle(/Sound Royale/);
  });

  test('page renders content', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
    });
    page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.goto('/');
    await page.waitForTimeout(3000);
    const root = page.locator('#root');
    const content = await root.innerHTML();
    console.log('Root content length:', content.length);
    expect(content.length).toBeGreaterThan(0);
  });
});

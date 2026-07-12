import { test, expect } from '@playwright/test';

test.describe('PII Prevention', () => {
  test('should not expose playerSecret in console logs', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const piiViolations: string[] = [];

    // Listen for console messages
    page.on('console', (msg) => {
      const text = msg.text();
      // Check for secret patterns in logs
      if (
        text.includes('secret=') ||
        text.includes('playerSecret') ||
        text.includes('player_secret') ||
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)
      ) {
        piiViolations.push(text);
      }
    });

    // Navigate to app (assumes dev server running)
    await page.goto('/');

    // Wait for the initial lobby shell so startup logs have already fired.
    await expect(page.getByRole('heading', { name: 'Sound Royale' })).toBeVisible();
    await expect(page.getByText('Enter a room code to join the battle')).toBeVisible();

    // Verify no PII was logged
    expect(piiViolations, `PII exposed in console: ${piiViolations.join('; ')}`).toHaveLength(0);
  });
});

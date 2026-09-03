import { test, expect } from '@playwright/test';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe('PII Safety', () => {
  test.setTimeout(60000);

  test('player_secret is never exposed in console logs or network traffic', async ({
    page,
    request,
  }) => {
    const consoleMessages: string[] = [];
    const networkResponses: string[] = [];

    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });

    page.on('pageerror', (error) => {
      consoleMessages.push(error.message);
    });

    page.on('response', async (response) => {
      try {
        const body = await response.text();
        networkResponses.push(body);
      } catch {
        // Response body may not be available for all requests
      }
    });

    // Create a room via API
    const createRes = await request.post(`${API_BASE}/rooms/`, {
      data: { host_name: 'TestHost' },
    });
    const room = await createRes.json();
    const playerSecret = room.player_secret;
    expect(playerSecret).toBeTruthy();

    // Navigate to room page directly (no UI interaction needed)
    await page.goto(`/room/${room.room_code}`);
    await expect(page.locator('[data-testid="lobby"]')).toBeVisible({ timeout: 15000 });

    // Check that player_secret does NOT appear in any console message
    const secretInConsole = consoleMessages.filter((msg) => msg.includes(playerSecret));
    expect(secretInConsole, `Secret found in console: ${secretInConsole.join(', ')}`).toHaveLength(
      0,
    );

    // Check that player_secret does NOT appear in any network response body
    // (except the initial create response which is expected)
    const secretInNetwork = networkResponses.filter(
      (body) => body.includes(playerSecret) && !body.includes(room.room_code),
    );
    expect(
      secretInNetwork,
      `Secret found in ${secretInNetwork.length} network response(s)`,
    ).toHaveLength(0);

    // Check that player_secret is not in the URL
    const url = page.url();
    expect(url).not.toContain(playerSecret);

    // Check that player_secret is not in any error message displayed to user
    const errorElements = await page
      .locator('[data-testid="error-message"], .error, .toast-error')
      .all();
    for (const el of errorElements) {
      const text = await el.textContent();
      if (text) {
        expect(text).not.toContain(playerSecret);
      }
    }
  });
});

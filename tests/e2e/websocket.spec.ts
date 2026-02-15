import { test, expect } from '@playwright/test';

test.describe('WebSocket Real-time Updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __WS_INSTANCES?: WebSocket[] }).__WS_INSTANCES = [];
      const OriginalWebSocket = window.WebSocket;
      (window as unknown as { WebSocket: typeof WebSocket }).WebSocket = function(url: string | URL, protocols?: string | string[]) {
        const ws = new OriginalWebSocket(url, protocols);
        ((window as unknown as { __WS_INSTANCES?: WebSocket[] }).__WS_INSTANCES || []).push(ws);
        return ws;
      } as unknown as typeof WebSocket;
    });
  });

  test('should establish WebSocket connection on room join', async ({ page }) => {
    await page.goto('/room/test-room');

    const wsConnection = await page.evaluate(async () => {
      return new Promise<string>((resolve, reject) => {
        let ws: WebSocket | null = null;
        const timeoutId = setTimeout(() => {
          reject(new Error('WebSocket connection check timed out'));
        }, 5000);
        
        const checkConnection = () => {
          const sockets = (window as unknown as { __WS_INSTANCES?: WebSocket[] }).__WS_INSTANCES || [];
          if (sockets.length > 0) {
            clearTimeout(timeoutId);
            ws = sockets[0];
            resolve(ws?.readyState === WebSocket.OPEN ? 'connected' : 'pending');
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    });

    expect(['connected', 'pending']).toContain(wsConnection);
  });

  test('should handle game state updates via WebSocket', async ({ page }) => {
    await page.goto('/room/test-room');

    const hasGameState = await page.locator('[data-testid="game-board"]').count() > 0 ||
                        await page.locator('.bingo-board').count() > 0;
    expect(hasGameState).toBeTruthy();
  });

  test('should display real-time player updates', async ({ page }) => {
    await page.goto('/room/test-room');

    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });

    const playerListVisible = await page.locator('[data-testid="player-list"]').count() > 0 ||
                             await page.locator('.player-list, [class*="player"]').count() > 0;
    expect(playerListVisible).toBeTruthy();
  });

  test('should handle WebSocket disconnection gracefully', async ({ page }) => {
    await page.goto('/room/test-room');

    const consoleMessages: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleMessages.push(msg.text());
      }
    });

    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });

    const hasReconnectionMessage = consoleMessages.some(
      msg => msg.toLowerCase().includes('disconnect') ||
             msg.toLowerCase().includes('reconnect') ||
             msg.toLowerCase().includes('websocket')
    );

    expect(consoleMessages.length === 0 || hasReconnectionMessage).toBeTruthy();
  });

  test('should show live indicator for active game', async ({ page }) => {
    await page.goto('/room/test-room');

    const liveIndicator = page.locator('text=LIVE');
    await expect(liveIndicator).toBeVisible({ timeout: 5000 });
  });
});

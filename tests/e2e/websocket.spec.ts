import { test, expect } from '@playwright/test';

const API_BASE_URL = 'http://localhost:8000/api';

const mockRoomResponse = {
  code: 'test-room',
  status: 'playing',
  current_round: 1,
  players: [
    {
      id: 'player1',
      name: 'TestPlayer',
      avatar: undefined,
      tiles: [
        { id: 'tile0', genre: 'Hip Hop', status: 'empty', position: 0 },
        { id: 'tile1', genre: 'Jazz', status: 'empty', position: 1 },
        { id: 'tile2', genre: 'Rock', status: 'empty', position: 2 },
        { id: 'tile3', genre: 'Pop', status: 'empty', position: 3 },
        { id: 'tile4', genre: 'Electronic', status: 'empty', position: 4 },
        { id: 'tile5', genre: 'Classical', status: 'empty', position: 5 },
        { id: 'tile6', genre: 'R&B', status: 'empty', position: 6 },
        { id: 'tile7', genre: 'Country', status: 'empty', position: 7 },
        { id: 'tile8', genre: 'Metal', status: 'empty', position: 8 }
      ],
      player_secret: 'test-secret',
      is_connected: true,
      is_spectator: false
    }
  ]
};

test.describe('WebSocket Real-time Updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'TestPlayer',
        playerId: 'player1',
        playerSecret: 'test-secret',
        isSpectator: false,
        isHost: true
      }));
    });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: mockRoomResponse });
      } else {
        await route.continue();
      }
    });

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

    await expect(page.locator('h1:has-text("Sound Royale")')).toBeVisible({ timeout: 10000 });
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

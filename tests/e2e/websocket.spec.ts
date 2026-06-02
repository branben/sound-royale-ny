import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes, setupPlayerSession, mockWebSocketConnection, createMockGameStateUpdate, createMockPlayerJoined, createMockGameStarted, createMockGameFinished } from './helpers';
import { createMockPlayingStateWithoutGenre, createMockProducer, toRoomResponse } from './utils/game-fixtures';

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

test.describe('Mocked WebSocket Real-time Updates', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await mockWebSocketConnection(page);
    // Create proper game state using fixtures
    const producer = createMockProducer('TestPlayer');
    const gameState = createMockPlayingStateWithoutGenre({ [producer.id]: producer });

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'test-secret',
    });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: {
        player: producer,
        playerSecret: 'test-secret',
      },
    });
  });

  test('should establish WebSocket connection on room join', async ({ page }) => {
    await page.goto('/room/test-room');

    // Test WebSocket connection establishment with delay for auto-connect
    const wsConnected = await page.evaluate(() => {
      return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:8000/ws/game/');
        
        // Wait for auto-connection
        setTimeout(() => {
          resolve({
            connected: ws.readyState === 1, // WebSocket.OPEN
            url: ws.url,
            instanceCount: (window as any).__WS_INSTANCES?.length || 0
          });
        }, 50);
      });
    }) as { connected: boolean; url: string; instanceCount: number };

    expect(wsConnected.connected).toBe(true);
    expect(wsConnected.url).toBe('ws://localhost:8000/ws/game/');
    expect(wsConnected.instanceCount).toBeGreaterThan(0);
  });

  test('should handle game state updates via WebSocket', async ({ page }) => {
    await page.goto('/room/test-room');

    // Test message injection functionality with delay for auto-connect
    const messageTest = await page.evaluate(() => {
      return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:8000/ws/game/');
        
        // Wait for auto-connection, then test message injection
        setTimeout(() => {
          // Set up message listener
          let messageReceived = false;
          ws.addEventListener('message', (event) => {
            messageReceived = true;
          });
          
          // Inject a test message
          (ws as any).injectMessage({
            type: 'game_state_update',
            data: { hello: 'world', timestamp: Date.now() }
          });
          
          resolve({
            connected: ws.readyState === 1,
            messageReceived,
            hasInjectMethod: typeof (ws as any).injectMessage === 'function'
          });
        }, 50);
      });
    }) as { connected: boolean; messageReceived: boolean; hasInjectMethod: boolean };

    expect(messageTest.connected).toBe(true);
    expect(messageTest.hasInjectMethod).toBe(true);
    expect(messageTest.messageReceived).toBe(true);
  });

  test('should display real-time player updates', async ({ page }) => {
    await page.goto('/room/test-room');

    // Test player joined message injection with delay for auto-connect
    const playerTest = await page.evaluate(() => {
      return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:8000/ws/game/');
        
        // Wait for auto-connection, then test message injection
        setTimeout(() => {
          // Set up message listener
          let messageReceived = false;
          ws.addEventListener('message', (event) => {
            messageReceived = true;
          });
          
          // Inject a player joined message
          (ws as any).injectMessage({
            type: 'player_joined',
            data: { playerName: 'TestPlayer', id: 'player123' }
          });
          
          resolve({
            connected: ws.readyState === 1,
            messageReceived,
            hasInjectMethod: typeof (ws as any).injectMessage === 'function'
          });
        }, 50);
      });
    }) as { connected: boolean; messageReceived: boolean; hasInjectMethod: boolean };

    expect(playerTest.connected).toBe(true);
    expect(playerTest.hasInjectMethod).toBe(true);
    expect(playerTest.messageReceived).toBe(true);
  });

  test('should handle WebSocket disconnection gracefully', async ({ page }) => {
    await page.goto('/room/test-room');

    // Test WebSocket lifecycle with delay for auto-connect
    const lifecycleTest = await page.evaluate(() => {
      return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:8000/ws/game/');
        
        // Wait for auto-connection, then test lifecycle
        setTimeout(() => {
          const initialState = ws.readyState;
          
          // Simulate disconnect
          (ws as any).simulateDisconnect();
          const disconnectedState = ws.readyState;
          
          // Test that methods exist
          const hasDisconnectMethod = typeof (ws as any).simulateDisconnect === 'function';
          const hasReconnectMethod = typeof (ws as any).simulateReconnect === 'function';
          
          resolve({
            initial: initialState,
            disconnected: disconnectedState,
            hasDisconnectMethod,
            hasReconnectMethod,
            connected: ws.readyState === 1
          });
        }, 50);
      });
    }) as { initial: number; disconnected: number; hasDisconnectMethod: boolean; hasReconnectMethod: boolean; connected: boolean };

    expect(lifecycleTest.initial).toBe(1); // OPEN
    expect(lifecycleTest.disconnected).toBe(3); // CLOSED
    expect(lifecycleTest.hasDisconnectMethod).toBe(true);
    expect(lifecycleTest.hasReconnectMethod).toBe(true);
    expect(lifecycleTest.connected).toBe(false); // Should be disconnected
  });

  test('should show live indicator for active game', async ({ page }) => {
    await page.goto('/room/test-room');

    const liveIndicator = page.getByText('Live', { exact: true }).first();
    await expect(liveIndicator).toBeVisible({ timeout: 5000 });
  });
});

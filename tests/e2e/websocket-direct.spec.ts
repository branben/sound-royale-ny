import { test, expect } from '@playwright/test';
import { enableE2EMode, mockWebSocketConnection } from './helpers';

test.describe('WebSocket Direct Infrastructure Test', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await mockWebSocketConnection(page);
  });

  test('should mock WebSocket on blank page', async ({ page }) => {
    // Navigate to a blank page to test WebSocket infrastructure directly
    await page.goto('about:blank');
    
    // Test that WebSocket mocking works without full frontend
    const wsTest = await page.evaluate(() => {
      const ws = new WebSocket('ws://localhost:8000/ws/game/');
      
      return {
        hasMockMethods: typeof (ws as unknown).injectMessage === 'function',
        hasSimulateMethods: typeof (ws as unknown).simulateDisconnect === 'function' && 
                           typeof (ws as unknown).simulateReconnect === 'function',
        hasCorrectStates: ws.CONNECTING === 0 && ws.OPEN === 1 && ws.CLOSING === 2 && ws.CLOSED === 3,
        initiallyConnecting: ws.readyState === 0
      };
    });

    expect(wsTest.hasMockMethods).toBe(true);
    expect(wsTest.hasSimulateMethods).toBe(true);
    expect(wsTest.hasCorrectStates).toBe(true);
    expect(wsTest.initiallyConnecting).toBe(true);
  });

  test('should handle WebSocket lifecycle on blank page', async ({ page }) => {
    await page.goto('about:blank');
    
    const lifecycleTest = await page.evaluate(() => {
      return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:8000/ws/game/');
        
        // Wait for connection, then test lifecycle
        setTimeout(() => {
          const initialState = ws.readyState;
          
          // Simulate disconnect
          (ws as unknown).simulateDisconnect();
          const disconnectedState = ws.readyState;
          
          // Simulate reconnect
          (ws as unknown).simulateReconnect();
          
          // Wait for reconnection
          setTimeout(() => {
            resolve({
              initial: initialState,
              disconnected: disconnectedState,
              reconnected: ws.readyState
            });
          }, 100);
        }, 50);
      });
    });

    expect(lifecycleTest.initial).toBe(1); // OPEN
    expect(lifecycleTest.disconnected).toBe(3); // CLOSED
    expect(lifecycleTest.reconnected).toBe(1); // OPEN again
  });

  test('should handle message injection on blank page', async ({ page }) => {
    await page.goto('about:blank');
    
    const messageTest = await page.evaluate(() => {
      return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:8000/ws/game/');
        let messageReceived = false;
        let receivedData = null;
        
        // Wait for connection, then test message injection
        setTimeout(() => {
          // Set up message listener
          ws.addEventListener('message', (event) => {
            messageReceived = true;
            receivedData = JSON.parse(event.data);
          });
          
          // Inject a test message
          (ws as unknown).injectMessage({
            type: 'test_message',
            data: { hello: 'world', timestamp: Date.now() }
          });
          
          // Wait for message delivery
          setTimeout(() => {
            resolve({
              connected: ws.readyState === 1,
              messageReceived,
              receivedData
            });
          }, 50);
        }, 50);
      });
    });

    expect(messageTest.connected).toBe(true);
    expect(messageTest.messageReceived).toBe(true);
    expect(messageTest.receivedData).toEqual({
      hello: 'world',
      timestamp: expect.any(Number)
    });
  });

  test('should track WebSocket instances on blank page', async ({ page }) => {
    await page.goto('about:blank');
    
    const instanceTest = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Create multiple WebSocket instances
        const ws1 = new WebSocket('ws://localhost:8000/ws/game/');
        const ws2 = new WebSocket('ws://localhost:8000/ws/game/');
        
        setTimeout(() => {
          const instances = (window as unknown).__WS_INSTANCES || [];
          resolve({
            instanceCount: instances.length,
            allConnected: instances.every((ws: unknown) => ws.readyState === 1),
            hasTracking: Array.isArray(instances)
          });
        }, 100);
      });
    });

    expect(instanceTest.instanceCount).toBe(2);
    expect(instanceTest.allConnected).toBe(true);
    expect(instanceTest.hasTracking).toBe(true);
  });

  test('should preserve original WebSocket constructor on blank page', async ({ page }) => {
    await page.goto('about:blank');
    
    const preservationTest = await page.evaluate(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const hasOriginal = typeof (window as unknown).OriginalWebSocket === 'function';
          const hasMock = typeof (window as unknown).MockWebSocket === 'function';
          const currentIsMock = window.WebSocket !== (window as unknown).OriginalWebSocket;
          
          resolve({
            hasOriginal,
            hasMock,
            currentIsMock
          });
        }, 50);
      });
    });

    expect(preservationTest.hasOriginal).toBe(true);
    expect(preservationTest.hasMock).toBe(true);
    expect(preservationTest.currentIsMock).toBe(true);
  });
});

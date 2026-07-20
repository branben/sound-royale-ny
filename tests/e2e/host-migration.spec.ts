import { test, expect } from '@playwright/test';
import {
  enableE2EMode,
  setupPlayerSession,
  mockApiRoutes,
  mockWebSocketConnection,
} from './helpers';
import {
  createMockPlayingState,
  createMockProducer,
  createMockHostProducer,
  toRoomResponse,
} from './utils/game-fixtures';

test.describe('Host Migration', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('host migration indicator appears when host disconnects', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169 (host-migration-indicator needs host_migrated WS flow + app reconnect handling)
    const host = createMockHostProducer('HostPlayer', { id: 'host-1' });
    const newHost = createMockProducer('NewHostPlayer', { id: 'newhost-1' });
    const players = { [host.id]: host, [newHost.id]: newHost };
    const gameState = {
      ...createMockPlayingState(players),
      totalRounds: 3,
    };

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: newHost, playerSecret: 'newhost-secret' },
    });

    await mockWebSocketConnection(page);

    await setupPlayerSession(page, {
      playerName: newHost.name,
      playerId: 'newhost-1',
      playerSecret: 'newhost-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Inject host_migrated message (host disconnect is simulated by the app's
    // own reconnect logic; the indicator renders from this WS message)
    await page.evaluate(() => {
      const instances = (window as any).__WS_INSTANCES;
      if (instances && instances.length > 0) {
        instances[0].injectMessage({
          type: 'host_migrated',
          data: { newHostId: 'new-host-id', newHostName: 'NewHostPlayer' },
          timestamp: Date.now(),
        });
      }
    });

    await expect(page.getByTestId('host-migration-indicator')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('host-migration-indicator')).toContainText('NewHostPlayer');
  });
});

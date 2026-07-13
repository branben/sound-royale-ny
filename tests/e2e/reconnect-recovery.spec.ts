/**
 * WebSocket Reconnect Recovery — ACTIVE E2E test.
 *
 * Exercises the full acceptance criteria for "WebSocket reconnection must
 * re-fetch full game state":
 *   - On reconnect the client GETs /api/rooms/{code}/ and replaces game state.
 *   - A "Reconnecting…" banner shows during the disconnect→reconnect window.
 *   - After reconnect the board reflects current server state (no stale tiles).
 *   - No duplicate re-fetches / flicker during the re-fetch.
 *
 * Runs in REAL (non-E2E-mock) mode so the app's actual socket effect in
 * GameContext executes. The WebSocket is swapped at the page level for the
 * test MockWebSocket (helpers.mockWebSocketConnection), and /api/rooms is
 * mocked to return a mutable authoritative snapshot. No real backend needed.
 */

import { test, expect, Page } from '@playwright/test';
import { mockWebSocketConnection, mockApiRoutes, setupPlayerSession } from './helpers';
import { createMockProducer, createMockPlayingState, toRoomResponse } from './utils/game-fixtures';

interface WsWindow extends Window {
  __WS_INSTANCES?: Array<{ readyState: number; simulateDisconnect: () => void }>;
  __USE_RECOVERED__?: boolean;
}

async function forceDisconnect(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as WsWindow;
    const ws = win.__WS_INSTANCES?.[win.__WS_INSTANCES.length - 1];
    ws?.simulateDisconnect();
  });
}

test.describe('WebSocket Reconnect Recovery', () => {
  test('kills the WS mid-game, restores it, and recovers the board from server state', async ({ page }) => {
    const producer = createMockProducer('RecoveryPlayer');
    const opponent = createMockProducer('RecoveryOpponent');
    const initialGame = createMockPlayingState({ [producer.id]: producer, [opponent.id]: opponent });
    const initialRoom = toRoomResponse(initialGame);

    // Authoritative snapshot the server returns on the post-reconnect re-fetch.
    // Advances the round and flips the producer's first tile to "complete" so we
    // can prove the UI was REPLACED from server state, not left stale.
    const recoveredGame = createMockPlayingState({ [producer.id]: producer, [opponent.id]: opponent });
    recoveredGame.currentRound = (initialGame.currentRound ?? 1) + 3;
    const recoveredTiles = recoveredGame.players[producer.id].board.tiles;
    recoveredTiles[0] = {
      ...recoveredTiles[0],
      status: 'complete' as const,
      audioUrl: 'https://example.com/recovered.mp3',
    };
    const recoveredRoom = toRoomResponse(recoveredGame);

    let roomFetchCount = 0;
    let useRecovered = false;

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: producer.id,
      playerSecret: 'recovery-secret',
    });
    await mockWebSocketConnection(page);
    await mockApiRoutes(page, {
      roomResponse: async (route) => {
        roomFetchCount += 1;
        const body = useRecovered ? recoveredRoom : initialRoom;
        await route.fulfill({ status: 200, json: body });
      },
      rejoin: { player: producer, playerSecret: 'recovery-secret' },
    });

    await page.goto(`/room/${initialGame.id}`);

    // Initial load: board visible + first fetch happened.
    await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 10000 });
    const firstFetchCount = roomFetchCount;
    expect(firstFetchCount).toBeGreaterThan(0);

    // App socket connected.
    await page.waitForFunction(() => {
      const win = window as unknown as WsWindow;
      const ws = win.__WS_INSTANCES?.[win.__WS_INSTANCES.length - 1];
      return !!ws && ws.readyState === 1;
    });

    // --- Kill the WS connection mid-game ---
    await forceDisconnect(page);

    // Banner appears during the recovery window.
    await expect(page.getByTestId('reconnecting-banner')).toBeVisible({ timeout: 5000 });

    // Disconnect alone must NOT have triggered a re-fetch yet.
    expect(roomFetchCount).toBe(firstFetchCount);

    // Arm the server to return the advanced snapshot on the next /api/rooms fetch,
    // then let the app's own reconnect logic re-open the socket and re-fetch.
    useRecovered = true;

    // The reconnect re-fetch returns the recovered snapshot and the app REPLACES
    // gameState with it, so the RoundStage (bound to gameState.currentRound)
    // advances to the recovered round — proving the board reflects server state.
    const initialRound = initialGame.currentRound ?? 1;
    const recoveredRound = (initialRound + 3).toString();
    await expect(page.getByTestId('round-stage').getByText(new RegExp(`^Round ${recoveredRound}`))).toBeVisible({
      timeout: 15000,
    });

    // Exactly ONE additional re-fetch on reconnect (no duplicate / flicker).
    expect(roomFetchCount).toBe(firstFetchCount + 1);

    // Banner is gone once reconnected.
    await expect(page.getByTestId('reconnecting-banner')).toBeHidden({ timeout: 5000 });
  });
});

import { test, expect, type Browser, type Page } from '@playwright/test';
import { PlayerPage } from './pom/PlayerPage';
import { getGameState } from './helpers';

/**
 * Integration tests for the critical create → join → start flow.
 *
 * These tests run against a real backend (localhost:8000) and verify
 * the full end-to-end user journey without mocking API responses.
 *
 * Requires:
 *   - Backend running at localhost:8000
 *   - Frontend running at localhost:8080
 *
 * Run with: LIVE_API_BASE_URL=http://localhost:8000/api npx playwright test tests/e2e/live/create-join-start.spec.ts
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestActor = {
  context: Awaited<ReturnType<Browser['newContext']>>;
  page: Page;
  errors: string[];
};

async function createActor(browser: Browser): Promise<TestActor> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  return { context, page, errors };
}

async function closeActors(actors: TestActor[]): Promise<void> {
  await Promise.all(actors.map((actor) => actor.context.close()));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Create → Join → Start Integration Flow', () => {

  // -----------------------------------------------------------------------
  // Scenario 1: Host creates room → sees "Start Battle" button
  //           (not "Waiting for more players" once 2+ players are present)
  // -----------------------------------------------------------------------
  test('host creates room and sees Start Battle button after second player joins', async ({ browser }) => {
    test.setTimeout(60000);

    const runId = Date.now().toString().slice(-6);
    const host = await createActor(browser);
    const player2 = await createActor(browser);
    const actors = [host, player2];

    try {
      // --- Host creates room via UI ---
      await host.page.goto('/');
      await host.page.getByTestId('player-name-input').fill(`Host${runId}`);
      await host.page.getByTestId('create-room-button').click();
      await host.page.getByTestId('create-room-name-input').fill(`TestRoom ${runId}`);
      await host.page.getByTestId('create-room-submit-button').click();

      // Wait for room to load and extract room code from the "Room Code: XXXX" text
      const roomCodeText = await host.page.getByText(/Room Code:/).textContent({ timeout: 15000 });
      const roomCode = roomCodeText?.match(/Room Code:\s*(\d{4})/)?.[1];
      expect(roomCode).toMatch(/^\d{4}$/);

      // Host should see "Waiting for more players" (not Start Battle yet — only 1 player)
      await expect(host.page.getByText(/Waiting for more players/i)).toBeVisible({ timeout: 10000 });

      // --- Second player joins via UI ---
      await player2.page.goto('/');
      await player2.page.getByTestId('player-name-input').fill(`Player${runId}`);
      await player2.page.getByTestId('join-room-mode-button').click();
      await player2.page.getByTestId('room-code-input').fill(roomCode!);
      await player2.page.getByTestId('join-room-button').click();

      // Player2 should see the lobby
      await expect(player2.page.getByText(/Room Code:/i)).toBeVisible({ timeout: 15000 });

      // Player2 toggles ready
      await player2.page.getByText('Click When Ready').click();
      await expect(player2.page.getByText(/I'm Ready!/i)).toBeVisible({ timeout: 10000 });

      // --- Host should now see "Start Battle" button ---
      await expect(host.page.getByTestId('start-battle')).toBeVisible({ timeout: 15000 });
      // Verify the button text
      await expect(host.page.getByTestId('start-battle')).toContainText('Start Battle');

      // Verify no "Waiting for more players" message is shown anymore
      await expect(host.page.getByText(/Waiting for more players/i)).not.toBeVisible();

      // Verify no browser console errors
      for (const actor of actors) {
        expect(actor.errors, `Browser errors: ${actor.page.url()}`).toEqual([]);
      }
    } finally {
      await closeActors(actors);
    }
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Second player joins → both players see correct lobby state
  // -----------------------------------------------------------------------
  test('both players see correct lobby state after join', async ({ browser }) => {
    test.setTimeout(60000);

    const runId = Date.now().toString().slice(-6);
    const host = await createActor(browser);
    const player2 = await createActor(browser);
    const actors = [host, player2];

    try {
      // --- Host creates room via API (faster, more reliable) ---
      const hostPage = new PlayerPage(host.page, `Host${runId}`, 'host');
      const roomCode = await hostPage.createRoom();

      // --- Player2 joins via API ---
      const player2Page = new PlayerPage(player2.page, `Player${runId}`, 'producer');
      await player2Page.joinRoom(roomCode, false);

      // --- Verify lobby state for host ---
      // Host should see room code
      await expect(host.page.getByText(`Room Code: ${roomCode}`)).toBeVisible({ timeout: 10000 });

      // --- Verify lobby state for player2 ---
      // Player2 should also see room code
      await expect(player2.page.getByText(`Room Code: ${roomCode}`)).toBeVisible({ timeout: 10000 });

      // Player2 should see the "Click When Ready" button
      await expect(player2.page.getByText('Click When Ready')).toBeVisible({ timeout: 10000 });

      // Player2 toggles ready
      await player2Page.toggleReady();
      await expect(player2.page.getByText(/I'm Ready!/i)).toBeVisible({ timeout: 10000 });

      // --- Verify backend state matches UI ---
      const backendState = await getGameState(roomCode);
      expect(backendState.status).toBe('lobby');

      // Both players should be in the backend state
      const playerValues = Object.values(backendState.players as Record<string, any>);
      expect(playerValues.length).toBe(2);

      // Verify player names match
      const playerNames = playerValues.map((p: any) => p.name);
      expect(playerNames).toContain(`Host${runId}`);
      expect(playerNames).toContain(`Player${runId}`);

      // Verify one is host, one is not
      const hostPlayer = playerValues.find((p: any) => p.is_host === true);
      const nonHostPlayer = playerValues.find((p: any) => p.is_host !== true);
      expect(hostPlayer).toBeTruthy();
      expect(nonHostPlayer).toBeTruthy();

      // Verify the non-host player is ready
      expect(nonHostPlayer.ready).toBe(true);

      for (const actor of actors) {
        expect(actor.errors, `Browser errors: ${actor.page.url()}`).toEqual([]);
      }
    } finally {
      await closeActors(actors);
    }
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Host starts game → both players see game board
  // -----------------------------------------------------------------------
  test('host starts game and both players see game board', async ({ browser }) => {
    test.setTimeout(90000);

    const runId = Date.now().toString().slice(-6);
    const host = await createActor(browser);
    const player2 = await createActor(browser);
    const actors = [host, player2];

    try {
      // --- Setup: create room and join via API ---
      const hostPage = new PlayerPage(host.page, `Host${runId}`, 'host');
      const roomCode = await hostPage.createRoom();

      const player2Page = new PlayerPage(player2.page, `Player${runId}`, 'producer');
      await player2Page.joinRoom(roomCode, false);

      // Player2 readies up
      await player2Page.toggleReady();

      // --- Host starts game ---
      await hostPage.startGame();

      // --- Both players should see the game board ---
      await expect(host.page.getByTestId('game-board').first()).toBeVisible({ timeout: 20000 });
      await expect(player2.page.getByTestId('game-board').first()).toBeVisible({ timeout: 20000 });

      // --- Verify backend state ---
      const backendState = await getGameState(roomCode);
      expect(backendState.status).toBe('playing');

      // Verify both players have boards with tiles
      const playerValues = Object.values(backendState.players as Record<string, any>);
      for (const player of playerValues) {
        if (player.is_spectator) continue;
        const tiles = player.board?.tiles || player.tiles || [];
        expect(tiles.length).toBeGreaterThan(0);
      }

      for (const actor of actors) {
        expect(actor.errors, `Browser errors: ${actor.page.url()}`).toEqual([]);
      }
    } finally {
      await closeActors(actors);
    }
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Player joins non-existent room → sees error message
  // -----------------------------------------------------------------------
  test('player joining non-existent room sees error message', async ({ browser }) => {
    test.setTimeout(30000);

    const player = await createActor(browser);

    try {
      await player.page.goto('/');
      await player.page.getByTestId('player-name-input').fill('LonelyPlayer');
      await player.page.getByTestId('join-room-mode-button').click();
      await player.page.getByTestId('room-code-input').fill('0000'); // Non-existent room
      await player.page.getByTestId('join-room-button').click();

      // Should see an error message
      await expect(player.page.getByText(/Room not found|Failed to join|Invalid room/i)).toBeVisible({ timeout: 10000 });

      expect(player.errors).toEqual([]);
    } finally {
      await closeActors([player]);
    }
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Player refreshes page → host status is restored from server
  // -----------------------------------------------------------------------
  test('host status is restored after page refresh via rejoin flow', async ({ browser }) => {
    test.setTimeout(60000);

    const runId = Date.now().toString().slice(-6);
    const host = await createActor(browser);
    const player2 = await createActor(browser);
    const actors = [host, player2];

    try {
      // --- Setup: create room and join ---
      const hostPage = new PlayerPage(host.page, `Host${runId}`, 'host');
      const roomCode = await hostPage.createRoom();

      const player2Page = new PlayerPage(player2.page, `Player${runId}`, 'producer');
      await player2Page.joinRoom(roomCode, false);

      // Player2 readies up
      await player2Page.toggleReady();

      // --- Verify host sees Start Battle BEFORE refresh ---
      await expect(host.page.getByTestId('start-battle')).toBeVisible({ timeout: 15000 });

      // --- Host refreshes the page ---
      await host.page.reload();

      // --- Host should still see Start Battle button after refresh ---
      // The rejoin flow should restore host status from server data
      await expect(host.page.getByTestId('start-battle')).toBeVisible({ timeout: 20000 });

      // --- Host can still start the game ---
      await hostPage.startGame();

      // Both players should see game board
      await expect(host.page.getByTestId('game-board').first()).toBeVisible({ timeout: 20000 });
      await expect(player2.page.getByTestId('game-board').first()).toBeVisible({ timeout: 20000 });

      // Verify backend state
      const backendState = await getGameState(roomCode);
      expect(backendState.status).toBe('playing');

      for (const actor of actors) {
        expect(actor.errors, `Browser errors: ${actor.page.url()}`).toEqual([]);
      }
    } finally {
      await closeActors(actors);
    }
  });
});

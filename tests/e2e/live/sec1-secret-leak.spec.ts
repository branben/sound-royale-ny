import { test, expect, type Browser, type Page } from '@playwright/test';
import { PlayerPage } from './pom/PlayerPage';

/**
 * SEC-1 regression: the player secret must NEVER be exposed via
 *   - the browser URL / query string / history, or
 *   - any console message (log/info/warn/error) or uncaught page error, or
 *   - a WebSocket connection URL (query param).
 *
 * Context: issue #105. The secret is a bearer-equivalent credential — if it
 * lands in a URL it leaks into browser history, server access logs, and the
 * `Referer` header; if it lands in a console/error string it leaks into
 * client-side error reporting (Sentry, etc.). It must travel only in an
 * Authorization header / POST body / the first WS message.
 *
 * This is a regression LOCK, not a smoke test: it runs the real create → join
 * → start flow against the live stack (backend :8000 + Redis + frontend :8081,
 * exactly what the E2E workflow in this PR boots) and fails loudly the moment
 * the concrete `player_secret` value appears in any of those sinks.
 *
 * Known historical leak vectors this guards (see src/services):
 *   - gameSocket.ts previously appended `?secret=<playerSecret>` to the WS URL.
 *   - discordApi.getAccountStatus put `player_secret` in a GET query string.
 *
 * Run with the live stack up:
 *   LIVE_API_BASE_URL=http://localhost:8000/api LIVE_WS_E2E=true \
 *     npx playwright test tests/e2e/live/sec1-secret-leak.spec.ts
 */

// Opt-in, same gating convention as the other live specs — needs the real
// backend + frontend running. In CI the E2E (Playwright) workflow provides it.
test.skip(
  !process.env.LIVE_API_BASE_URL,
  'SEC-1 regression needs the live stack. Run with LIVE_API_BASE_URL set (backend :8000 + frontend :8081).',
);

type LeakSinks = {
  /** Every URL the tab has ever pointed at (framenavigated + document.location). */
  urls: string[];
  /** Every console message text, regardless of level. */
  consoleMessages: string[];
  /** Every uncaught page error message. */
  pageErrors: string[];
  /** Every WebSocket URL the page opened. */
  wsUrls: string[];
};

/**
 * Attach listeners to every sink a secret could leak into. Must be called
 * before any navigation so we capture the whole lifecycle.
 */
function instrumentSinks(page: Page): LeakSinks {
  const sinks: LeakSinks = {
    urls: [],
    consoleMessages: [],
    pageErrors: [],
    wsUrls: [],
  };

  // URL: initial + every navigation (main frame and sub-frames).
  sinks.urls.push(page.url());
  page.on('framenavigated', (frame) => {
    sinks.urls.push(frame.url());
  });

  // Console: capture EVERY level — a secret logged at any level is a leak.
  page.on('console', (msg) => {
    sinks.consoleMessages.push(msg.text());
    // Also inspect structured args (objects logged, not just the format string).
    for (const arg of msg.args()) {
      sinks.consoleMessages.push(String(arg));
    }
  });

  // Uncaught errors — stack traces / messages must not embed the secret.
  page.on('pageerror', (err) => {
    sinks.pageErrors.push(err.message);
    if (err.stack) sinks.pageErrors.push(err.stack);
  });

  // WebSocket URLs — the historical `?secret=` leak vector.
  page.on('websocket', (ws) => {
    sinks.wsUrls.push(ws.url());
  });

  return sinks;
}

/**
 * Read the tab's current URL and full navigation history from inside the page,
 * catching anything the framenavigated listener might miss (e.g. history API
 * pushes that the client router performs without a document navigation).
 */
async function captureClientUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = [window.location.href];
    try {
      // history length can't enumerate entries, but the current entry + any
      // stored session key give us the live surface we care about.
      out.push(document.URL);
    } catch {
      /* ignore */
    }
    return out;
  });
}

/** Assert `secret` does not appear anywhere across all captured sinks. */
function assertNoLeak(label: string, secret: string, sinks: LeakSinks, extraUrls: string[]): void {
  expect(secret.length, `${label}: secret should be a non-empty credential`).toBeGreaterThan(0);

  const allUrls = [...sinks.urls, ...extraUrls];
  const leakingUrls = allUrls.filter((u) => u.includes(secret));
  expect(
    leakingUrls,
    `${label}: player secret leaked into a URL / query param / history (SEC-1, issue #105). ` +
      `Offending URLs: ${JSON.stringify(leakingUrls)}`,
  ).toEqual([]);

  const leakingWs = sinks.wsUrls.filter((u) => u.includes(secret));
  expect(
    leakingWs,
    `${label}: player secret leaked into a WebSocket URL query param (SEC-1, issue #105). ` +
      `Move it to the first WS message. Offending URLs: ${JSON.stringify(leakingWs)}`,
  ).toEqual([]);

  const leakingConsole = sinks.consoleMessages.filter((m) => m.includes(secret));
  expect(
    leakingConsole,
    `${label}: player secret leaked into a console message (SEC-1, issue #105). ` +
      `Offending messages: ${JSON.stringify(leakingConsole)}`,
  ).toEqual([]);

  const leakingErrors = sinks.pageErrors.filter((m) => m.includes(secret));
  expect(
    leakingErrors,
    `${label}: player secret leaked into an uncaught error string (SEC-1, issue #105). ` +
      `Offending errors: ${JSON.stringify(leakingErrors)}`,
  ).toEqual([]);
}

async function createActor(
  browser: Browser,
): Promise<{ context: Awaited<ReturnType<Browser['newContext']>>; page: Page; sinks: LeakSinks }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Suppress onboarding modal so the flow isn't blocked.
  await page.addInitScript(() => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    localStorage.setItem('hasSeenGameTutorial', 'true');
  });
  const sinks = instrumentSinks(page);
  return { context, page, sinks };
}

test.describe('SEC-1: player secret is never exposed (regression, issue #105)', () => {
  test('secret stays out of URL, console, and WS query param across create → join → start', async ({
    browser,
  }) => {
    test.setTimeout(90000);

    const runId = Date.now().toString().slice(-6);
    const host = await createActor(browser);
    const producer = await createActor(browser);
    const actors = [host, producer];

    try {
      // --- Host creates a room (real backend); secret is minted here ---
      const hostPage = new PlayerPage(host.page, `Host${runId}`, 'host');
      const roomCode = await hostPage.createRoom();
      const hostSecret = hostPage.playerSecret;
      expect(hostSecret, 'host should receive a player secret from the backend').toBeTruthy();

      // --- Producer joins the same room; gets its own secret ---
      const producerPage = new PlayerPage(producer.page, `Player${runId}`, 'producer');
      await producerPage.joinRoom(roomCode, false);
      const producerSecret = producerPage.playerSecret;
      expect(producerSecret, 'producer should receive a player secret').toBeTruthy();

      // --- Host starts the game (drives the authenticated action path) ---
      await hostPage.startGame();

      // --- Both players reach the live game board (WS connects here) ---
      await expect(host.page.getByTestId('game-board').first()).toBeVisible({ timeout: 20000 });
      await expect(producer.page.getByTestId('game-board').first()).toBeVisible({ timeout: 20000 });

      // Give any deferred WS connect / console logging a beat to fire.
      await host.page.waitForTimeout(1500);
      await producer.page.waitForTimeout(1500);

      // --- Assert: neither secret leaked into any sink for either actor ---
      const hostClientUrls = await captureClientUrls(host.page);
      const producerClientUrls = await captureClientUrls(producer.page);

      // A player's OWN secret must never leak in their own tab...
      assertNoLeak('host tab / host secret', hostSecret, host.sinks, hostClientUrls);
      assertNoLeak(
        'producer tab / producer secret',
        producerSecret,
        producer.sinks,
        producerClientUrls,
      );

      // ...and neither secret should ever surface in the OTHER player's tab.
      assertNoLeak('producer tab / host secret', hostSecret, producer.sinks, producerClientUrls);
      assertNoLeak('host tab / producer secret', producerSecret, host.sinks, hostClientUrls);
    } finally {
      await Promise.all(actors.map((a) => a.context.close()));
    }
  });
});

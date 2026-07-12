import { expect, test } from '@playwright/test';

test.skip(
  process.env.LIVE_WS_E2E !== 'true',
  'Opt-in live WebSocket test. Run with LIVE_WS_E2E=true while frontend, backend, and Redis are running.',
);

test.describe('Live WebSocket multiplayer joining', () => {
  test.setTimeout(60000);

  test('credentialed producers and spectators receive host-started match state', async ({
    browser,
  }, testInfo) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const runId = Date.now().toString(36);
    const hostName = `Host-${runId}`;
    const producerName = `Producer-${runId}`;
    const spectatorName = `Spectator-${runId}`;
    const contexts = [
      await browser.newContext(),
      await browser.newContext(),
      await browser.newContext(),
    ];
    const [hostContext, producerContext, spectatorContext] = contexts;

    try {
      for (const context of contexts) {
        await context.addInitScript(() => {
          localStorage.setItem('hasSeenOnboarding', 'true');
          localStorage.setItem('hasSeenGameTutorial', 'true');
        });
      }

      const hostPage = await hostContext.newPage();
      await hostPage.goto('/');
      await hostPage.getByTestId('player-name-input').fill(hostName);
      await hostPage.getByTestId('create-room-button').click();
      await hostPage.getByTestId('create-room-name-input').fill(`Live WS ${runId}`);
      await hostPage.getByTestId('create-room-submit-button').click();

      const roomCodeText = await hostPage.getByText(/Room Code:/).textContent();
      const roomCode = roomCodeText?.match(/\d{4}/)?.[0];
      expect(roomCode).toBeTruthy();
      await expect(hostPage).toHaveURL(new RegExp(`/room/${roomCode}`));

      const producerPage = await producerContext.newPage();
      await producerPage.goto('/');
      await producerPage.getByTestId('player-name-input').fill(producerName);
      await producerPage.getByTestId('join-room-mode-button').click();
      await producerPage.getByTestId('room-code-input').fill(roomCode!);
      await producerPage.getByTestId('join-room-button').click();
      await producerPage.waitForFunction(() =>
        Boolean(sessionStorage.getItem('soundRoyaleActiveSessionKey')),
      );
      await expect(producerPage).toHaveURL(new RegExp(`/room/${roomCode}`));
      await expect(producerPage.getByText("You're in battle!")).toBeVisible();

      await expect(hostPage.getByRole('button', { name: 'Start Battle' })).toBeVisible();
      await hostPage.getByRole('button', { name: 'Start Battle' }).click();

      await expect(hostPage.getByTestId('round-stage').getByText('Round 1')).toBeVisible();
      await expect(producerPage.getByTestId('round-stage').getByText('Round 1')).toBeVisible();

      const spectatorPage = await spectatorContext.newPage();
      await spectatorPage.goto('/');
      await spectatorPage.getByTestId('player-name-input').fill(spectatorName);
      await spectatorPage.getByTestId('join-room-mode-button').click();
      await spectatorPage.getByTestId('room-code-input').fill(roomCode!);
      await spectatorPage.getByTestId('join-room-button').click();
      await spectatorPage.waitForFunction(() =>
        Boolean(sessionStorage.getItem('soundRoyaleActiveSessionKey')),
      );
      await expect(spectatorPage).toHaveURL(new RegExp(`/room/${roomCode}`));
      await expect(spectatorPage.getByTestId('round-stage').getByText('Round 1')).toBeVisible();
      await expect(hostPage.getByText(/Players \(2\)/)).toBeVisible();
      await expect(hostPage.getByText(/Spectators \(1\)/)).toBeVisible();
      await expect(hostPage.getByText('Loading room...')).toBeHidden();
      await expect(producerPage.getByText('Loading room...')).toBeHidden();
      await expect(spectatorPage.getByText('Loading room...')).toBeHidden();

      const successScreenshots = [
        { name: 'producer-1-host-success', page: hostPage },
        { name: 'producer-2-success', page: producerPage },
        { name: 'spectator-success', page: spectatorPage },
      ];

      for (const screenshot of successScreenshots) {
        const path = testInfo.outputPath(`${screenshot.name}.png`);
        await screenshot.page.screenshot({ path, fullPage: true });
        await testInfo.attach(screenshot.name, {
          path,
          contentType: 'image/png',
        });
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});

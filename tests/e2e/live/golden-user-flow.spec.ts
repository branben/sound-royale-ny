import { test, expect, type Browser, type Page } from '@playwright/test';

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

test.describe('Live Golden User Flow', () => {
  test('host, producer, and spectator transition from lobby to live game without API shortcuts', async ({ browser }) => {
    test.setTimeout(90000);

    const runId = Date.now().toString().slice(-6);
    const host = await createActor(browser);
    const producer = await createActor(browser);
    const spectator = await createActor(browser);
    const actors = [host, producer, spectator];

    try {
      await host.page.goto('/');
      await host.page.getByTestId('player-name-input').fill(`Host${runId}`);
      await host.page.getByTestId('create-room-button').click();
      await host.page.getByTestId('create-room-name-input').fill(`Golden ${runId}`);
      await host.page.getByTestId('create-room-submit-button').click();

      const roomCode = await host.page.getByTestId('room-id').textContent({ timeout: 15000 });
      expect(roomCode).toMatch(/^\d{4}$/);

      await producer.page.goto('/');
      await producer.page.getByTestId('player-name-input').fill(`Producer${runId}`);
      await producer.page.getByTestId('join-room-mode-button').click();
      await producer.page.getByTestId('room-code-input').fill(roomCode!);
      await producer.page.getByTestId('join-room-button').click();
      await expect(producer.page.getByText('Click When Ready')).toBeVisible({ timeout: 15000 });

      await spectator.page.goto('/');
      await spectator.page.getByTestId('player-name-input').fill(`Spectator${runId}`);
      await spectator.page.getByTestId('join-room-mode-button').click();
      await spectator.page.getByTestId('room-code-input').fill(roomCode!);
      await spectator.page.getByTestId('join-spectator-button').click();
      await expect(spectator.page.getByText(/Players in lobby/i)).toBeVisible({ timeout: 15000 });

      await producer.page.getByText('Click When Ready').click();
      await expect(producer.page.getByText("✓ I'm Ready!")).toBeVisible({ timeout: 15000 });

      await expect(host.page.getByTestId('start-game')).toBeVisible({ timeout: 15000 });
      await host.page.getByTestId('start-game').click();

      await expect(host.page.getByTestId('game-board').first()).toBeVisible({ timeout: 20000 });
      await expect(producer.page.getByTestId('game-board').first()).toBeVisible({ timeout: 20000 });
      await expect(spectator.page.getByText('Battle Arena')).toBeVisible({ timeout: 20000 });
      await expect(spectator.page.getByTestId('request-to-play')).toBeVisible();
      await expect(spectator.page.getByTestId('game-board')).toHaveCount(2);

      for (const actor of actors) {
        expect(actor.errors, `Browser errors for ${actor.page.url()}`).toEqual([]);
      }
    } finally {
      await closeActors(actors);
    }
  });
});

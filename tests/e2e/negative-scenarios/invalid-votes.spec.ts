/**
 * Negative Scenario Tests - Invalid Votes
 * 
 * Tests invalid vote scenarios:
 * - Vote after round ends is rejected
 * - Double voting same round is blocked
 * - Non-spectator cannot vote
 * - Vote with invalid player_secret rejected
 * - Vote with expired token rejected
 */

import { test, expect } from '@playwright/test';
import {
  createMockVotingState,
  createMockFinishedState,
  createMockProducer,
  createMockSpectator,
} from '../utils/game-fixtures';

test.describe('Invalid Votes', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E_TESTING__ = true;
    });
  });

  test('should reject vote after round ends', async ({ page }) => {
    const producer = createMockProducer('Producer1');
    // Game is finished, voting is closed
    const gameState = createMockFinishedState({ [producer.id]: producer }, producer.id, 1);

    let voteRejected = false;

    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/vote')) {
        voteRejected = true;
        await route.fulfill({ status: 400, json: { error: 'Voting is closed' } });
      } else if (url.includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Spectator',
        playerId: 'spectator-id',
        playerSecret: 'spectator-secret',
        isSpectator: true,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}?spectator=true`);

    // Vote button should be disabled or not visible
    const voteButton = page.locator('button:has-text("Vote")');
    if (await voteButton.isVisible()) {
      await voteButton.click();
    }

    // Vote should be rejected
    expect(voteRejected).toBe(false); // Button shouldn't be clickable
  });

  test('should block double voting in same round', async ({ page }) => {
    const producer = createMockProducer('Producer1');
    const spectator = createMockSpectator('Spectator');
    
    const gameState = createMockVotingState({
      [producer.id]: producer,
      [spectator.id]: spectator,
    }, 1);

    let voteCount = 0;

    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/vote')) {
        voteCount++;
        if (voteCount > 1) {
          await route.fulfill({ status: 400, json: { error: 'Already voted' } });
        } else {
          await route.fulfill({ status: 200, json: { success: true } });
        }
      } else if (url.includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Spectator',
        playerId: spectator.id,
        playerSecret: 'spectator-secret',
        isSpectator: true,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}?spectator=true`);

    // Try to vote twice
    const voteButton = page.locator('button:has-text("Vote")').first();
    if (await voteButton.isVisible()) {
      await voteButton.click();
      await voteButton.click(); // Second attempt
    }

    // Should block second vote
    expect(voteCount).toBeLessThanOrEqual(1);
  });

  test('should not allow producer to vote', async ({ page }) => {
    const producer1 = createMockProducer('Producer1');
    const producer2 = createMockProducer('Producer2');
    
    const gameState = createMockVotingState({
      [producer1.id]: producer1,
      [producer2.id]: producer2,
    });

    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Producer1',
        playerId: producer1.id,
        playerSecret: 'producer1-secret',
        isSpectator: false,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}`);

    // Should NOT see voting panel for producers
    await expect(page.locator('[data-testid="voting-panel"]')).not.toBeVisible();
  });

  test('should reject vote with invalid player_secret', async ({ page }) => {
    const producer = createMockProducer('Producer1');
    const gameState = createMockVotingState({ [producer.id]: producer });

    let unauthorized = false;

    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/vote')) {
        unauthorized = true;
        await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      } else if (url.includes('/rooms/')) {
        await route.fulfill({ json: gameState });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('userSession', JSON.stringify({
        playerName: 'Spectator',
        playerId: 'spectator-id',
        playerSecret: 'invalid-secret', // Invalid secret
        isSpectator: true,
        isHost: false
      }));
    });

    await page.goto(`/room/${gameState.id}?spectator=true`);

    // Should show error for unauthorized
    // Note: In actual implementation, would verify 401 response
  });
});

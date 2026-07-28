// tests/e2e/visual-regression.spec.ts
// Visual-regression gate (technique B: Playwright toHaveScreenshot).
// Catches content / layout / CTA regressions pixelrag (technique A)
// cannot see — text, CTAs, live numbers, auth-state rendering.
//
// Routes use the repo's existing mock helpers (no Django/Redis
// backend needed in CI). Auth-gated room route uses
// setupPlayerSession + mockApiRoutes + mockWebSocketConnection.
//
// First run: write baselines via --update-snapshots, then commit
// the <spec>.spec.ts-snapshots/ directory (golden set).

import { test, expect } from '@playwright/test';
import {
  enableE2EMode,
  setupPlayerSession,
  mockApiRoutes,
  mockWebSocketConnection,
} from './helpers';

const routes = [
  { path: '/', name: 'lobby', waitText: 'SOUND ROYALE' },
  { path: '/spectator', name: 'spectator', waitText: 'Sound Royale' },
  { path: '/producer', name: 'producer', waitText: 'Producer' },
  { path: '/admin/themes', name: 'admin-themes', waitText: 'Theme' },
  { path: '/admin/players', name: 'admin-players', waitText: 'Player' },
  { path: '/leaderboard', name: 'leaderboard', waitText: 'Leaderboard' },
  {
    path: '/room/visual-regression-room',
    name: 'room',
    waitText: 'BATTLE ROOM',
    seeded: true,
  },
];

test.describe('visual regression', () => {
  for (const r of routes) {
    test(`${r.name} visual snapshot`, async ({ page }) => {
      if (r.seeded) {
        await enableE2EMode(page);
        await setupPlayerSession(page, {
          playerName: 'Bot',
          playerId: 'p1',
          playerSecret: 's',
          roomCode: 'visual-regression-room',
        });
        await mockWebSocketConnection(page);
        await mockApiRoutes(page, {
          roomResponse: {
            id: 'visual-regression-room',
            status: 'waiting',
            players: [],
            board: [],
            round: { index: 0, category: 'Any', revealed: false },
          },
        });
      }

      await page.goto(r.path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(r.waitText).first()).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(600);
      await expect(page).toHaveScreenshot(`${r.name}.png`, {
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });
  }
});

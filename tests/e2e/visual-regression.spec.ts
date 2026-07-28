// tests/e2e/visual-regression.spec.ts
// Visual-regression gate (technique B: Playwright toHaveScreenshot).
// Catches content / layout / CTA regressions pixelrag (technique A)
// cannot see — text, CTAs, live numbers, auth-state rendering.
//
// Routes use the repo's existing mock helpers (no Django/Redis
// backend needed in CI). /leaderboard is mocked via mockApiRoutes.
//
// Baseline note: the auth-gated /room route is intentionally excluded.
// Its room code renders in the design-system monospace stack
// ('SF Mono' on macOS, a different fallback on ubuntu-latest), so a
// macOS-generated baseline can never match the CI runner's rasterization.
// Snapshot baselines must be generated on the SAME OS as CI (ubuntu),
// which requires a Linux baseline-generation step. The room's
// auth-gated logic stays covered by the mock-driven e2e specs
// (rejoin-recovery, live-websocket, etc.) — only pixel coverage is
// deferred. First run (after adding a route): regenerate via
// --update-snapshots, then commit the <spec>.spec.ts-snapshots/ set.

import { test, expect, Page } from '@playwright/test';
import { enableE2EMode, mockApiRoutes } from './helpers';

type RouteDef = {
  path: string;
  name: string;
  waitText: string;
  mocked?: boolean;
};

const routes: RouteDef[] = [
  { path: '/', name: 'lobby', waitText: 'SOUND ROYALE' },
  { path: '/spectator', name: 'spectator-index', waitText: 'Spectating' },
  { path: '/producer', name: 'producer', waitText: 'Producer' },
  { path: '/admin/themes', name: 'admin-themes', waitText: 'Theme' },
  { path: '/admin/players', name: 'admin-players', waitText: 'Player' },
  {
    path: '/leaderboard',
    name: 'leaderboard',
    waitText: 'Leaderboard',
    mocked: true,
  },
];

async function setupLeaderboardRoute(page: Page) {
  await enableE2EMode(page);
  await mockApiRoutes(page, {
    leaderboard: { leaderboard: [] },
  });
}

test.describe('visual regression', () => {
  // Pin the baseline suffix to 'linux' so macOS and CI share one canonical
  // set (Playwright defaults to the host OS: 'darwin' locally). Supported via
  // testInfo.snapshotSuffix (not a toHaveScreenshot call option in 1.61.1).
  test.beforeEach(({}, testInfo) => {
    testInfo.snapshotSuffix = 'linux';
  });

  for (const r of routes) {
    test(`${r.name} visual snapshot`, async ({ page }) => {
      if (r.mocked) {
        await setupLeaderboardRoute(page);
      }

      await page.goto(r.path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(r.waitText).first()).toBeVisible({ timeout: 10000 });
      // Give fonts/layout a moment to settle. Avoid waitForLoadState('networkidle')
      // — the Vite HMR websocket keeps the network busy so it never fires.
      await page.waitForTimeout(400);
      await expect(page).toHaveScreenshot(`${r.name}.png`, {
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });
  }
});

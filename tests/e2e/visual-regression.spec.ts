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

import { test, expect, Page } from '@playwright/test';
import {
  enableE2EMode,
  setupPlayerSession,
  mockApiRoutes,
  mockWebSocketConnection,
} from './helpers';

type RouteDef = {
  path: string;
  name: string;
  waitText: string;
  seeded?: boolean;
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
  {
    path: '/room/visual-regression-room',
    name: 'room',
    waitText: 'Battle Room',
    seeded: true,
  },
];

async function setupRoomRoute(page: Page) {
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
      code: 'visual-regression-room',
      status: 'lobby',
      current_round: 0,
      players: [],
      board: [],
      theme_category: 'Any',
      round_revealed: false,
    },
    rejoin: {
      player: {
        id: 'p1',
        name: 'Bot',
        avatar: undefined,
        board: { tiles: [] },
        isConnected: true,
        isSpectator: false,
        isHost: false,
        isReady: false,
        eloRating: 0,
        eloWins: 0,
        eloLosses: 0,
        eloMatches: 0,
        isCheckedIn: false,
        currentTitle: 'NONE',
        scoreInfo: null,
      },
      playerSecret: 's',
    },
  });
}

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
      if (r.seeded) {
        await setupRoomRoute(page);
      }

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

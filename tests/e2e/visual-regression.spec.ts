import { test, expect } from '@playwright/test';
import {
  enableE2EMode,
  setupPlayerSession,
  mockApiRoutes,
  mockWebSocketConnection,
} from './helpers';

/**
 * Visual-regression suite (PixelRAG-adjacent, Playwright-native).
 *
 * One `toHaveScreenshot` assertion per route. First run writes the baseline
 * PNG under <spec>-snapshots/; subsequent runs diff and FAIL on visual change.
 * This is the unattended, open-source, CI-runnable content/layout gate — it
 * catches text/CTA/layout regressions that the PixelRAG design-token checks
 * (bgNearBlack/gradient/glow) cannot.
 *
 * Gotchas (learned the hard way):
 *  - NEVER waitUntil:'networkidle' against Vite — its HMR websocket never idles.
 *  - Disable animations in toHaveScreenshot (GSAP lobby anim is non-deterministic).
 *  - Wait for a route-specific anchor so we screenshot the loaded page, not a
 *    redirect/404.
 *
 * Run: pnpm exec playwright test tests/e2e/visual-regression.spec.ts
 * Update baselines: append --update-snapshots
 */

interface RouteSpec {
  path: string;
  name: string; // snapshot basename
  waitText: string; // anchor proving the page loaded (not a redirect/404)
  seeded?: boolean; // room route needs a mocked session + API
}

const PUBLIC_ROUTES: RouteSpec[] = [
  { path: '/', name: 'lobby', waitText: 'SOUND ROYALE' },
  { path: '/spectator', name: 'spectator-index', waitText: 'Spectator' },
  { path: '/producer', name: 'producer', waitText: 'Producer' },
  { path: '/admin/themes', name: 'admin-themes', waitText: 'Theme' },
  { path: '/admin/players', name: 'admin-players', waitText: 'Player' },
  { path: '/leaderboard', name: 'leaderboard', waitText: 'Leaderboard' },
  { path: '/auth/discord/callback', name: 'discord-callback', waitText: 'Discord' },
  { path: '/zzz-not-found', name: 'not-found', waitText: 'not found' },
];

// Auth-gated room route, rendered with a mocked session + API (no backend).
const ROOM_ROUTE: RouteSpec = {
  path: '/room/test-room-id',
  name: 'room',
  waitText: 'BATTLE ROOM',
  seeded: true,
};

const mockRoomResponse = {
  code: 'test-room-id',
  status: 'lobby',
  current_round: 1,
  players: [
    {
      id: 'player1',
      name: 'VerifierBot',
      avatar: undefined,
      tiles: Array.from({ length: 9 }, (_, i) => ({
        id: `tile${i}`,
        genre: 'Hip Hop',
        status: 'empty',
        position: i,
      })),
      player_secret: 'test-secret',
      is_connected: true,
      is_spectator: false,
      is_host: true,
    },
  ],
};

test.describe('visual regression', () => {
  for (const route of [...PUBLIC_ROUTES, ROOM_ROUTE]) {
    test.skip(`${route.name} visual snapshot [reference snapshots not committed — tracked test rot #169; visual-verify.yml covers visual regression]`, async ({
      page,
    }) => {
      if (route.seeded) {
        await enableE2EMode(page);
        await setupPlayerSession(page, {
          playerName: 'VerifierBot',
          playerId: 'player1',
          playerSecret: 'test-secret',
          roomCode: 'test-room-id',
          isSpectator: false,
        });
        await mockWebSocketConnection(page);
        await mockApiRoutes(page, {
          roomResponse: mockRoomResponse,
          rejoin: { player: mockRoomResponse.players[0] as never, playerSecret: 'test-secret' },
        });
      }

      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      // Anchor proves the real page loaded (not a 404/redirect).
      await expect(page.getByText(route.waitText, { exact: false }).first()).toBeVisible({
        timeout: 10000,
      });
      // Let GSAP/transitions settle before the deterministic crop.
      await page.waitForTimeout(600);

      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });
  }
});

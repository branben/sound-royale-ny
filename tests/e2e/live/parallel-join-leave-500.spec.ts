/**
 * Captures the raw HTTP 500 response body from Daphne when concurrent
 * joinRoom / leaveRoom requests race on a shared room.
 *
 * Primary job: capture. Soft-assert; attach bodies to the test report.
 * Run with: npx playwright test tests/e2e/live/parallel-join-leave-500.spec.ts
 *            --workers=4 --retries=0 --reporter=list
 *
 * Requires a live backend (Daphne + Postgres + Redis). The globalSetup
 * truncation keeps each run clean; each test uses a unique room code so
 * parallel tests don't collide.
 */

import { test, expect } from '@playwright/test';
import axios from 'axios';
import { joinRoom, getGameState } from './helpers';
import { PlayerPage } from './pom/PlayerPage';

const API_BASE = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';

test.describe.configure({ mode: 'parallel' });

test('captures 500 body from concurrent join/leave on shared room', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120000);

  // --- Layer B: page-level network listener (catches frontend-observed 500s) ---
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const page500s: string[] = [];
  hostPage.on('response', async (res) => {
    if (res.status() >= 500) {
      const body = await res.text();
      page500s.push(`${res.url()} :: ${body}`);
      await testInfo.attach(`page-500-${page500s.length}`, { body, contentType: 'text/plain' });
    }
  });

  // --- Create one host room (unique code per run) ---
  const player = new PlayerPage(hostPage, `Host-${Date.now()}`, 'host');
  const roomCode = await player.createRoom();

  // --- Intra-test burst: K players join + leave the SAME room concurrently ---
  const K = 10;
  const names = Array.from(
    { length: K },
    (_, i) => `P${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  );
  const captured: Array<{ url: string; status: number; body: unknown }> = [];

  await Promise.all(
    names.map(async (name) => {
      let playerId: string | null = null;
      let playerSecret: string | null = null;
      try {
        // Join — may 500 here
        const jr = await joinRoom(roomCode, name, false);
        playerId = jr.id;
        playerSecret = jr.player_secret;
      } catch (err: any) {
        const r = err.response;
        if (r && r.status >= 500) {
          captured.push({ url: r.config?.url || '', status: r.status, body: r.data });
          console.log(`[500 JOIN BODY] ${name}: ${JSON.stringify(r.data)}`);
          await testInfo.attach(`500-join-${name}`, {
            body: JSON.stringify(r.data),
            contentType: 'application/json',
          });
        }
        // 409 = idempotent duplicate, not the bug; tolerate and skip leave
        if (r && r.status === 409) {
          const state = await getGameState(roomCode);
          const existing = Object.values(state.players || {}).find(
            (p: any) => p.name?.toLowerCase() === name.toLowerCase(),
          );
          if (existing) {
            playerId = existing.id;
            playerSecret = existing.player_secret;
          }
        }
      }

      // Leave via direct axios (bypass leaveRoom helper which swallows errors)
      if (playerSecret) {
        try {
          await axios.post(`${API_BASE}/players/${playerSecret}/leave_game/`, {
            player_secret: playerSecret,
          });
        } catch (err: any) {
          const r = err.response;
          if (r && r.status >= 500) {
            captured.push({ url: r.config?.url || '', status: r.status, body: r.data });
            console.log(`[500 LEAVE BODY] ${name}: ${JSON.stringify(r.data)}`);
            await testInfo.attach(`500-leave-${name}`, {
              body: JSON.stringify(r.data),
              contentType: 'application/json',
            });
          }
        }
      }
    }),
  );

  // --- Report. Do NOT hard-fail (capture, not regression gate). ---
  if (captured.length > 0 || page500s.length > 0) {
    console.log(`REPRODUCED: ${captured.length} axios 500s, ${page500s.length} page 500s`);
    testInfo.annotations.push({
      type: 'repro',
      description: `join/leave 500 captured: ${captured.length} axios, ${page500s.length} page`,
    });
  } else {
    console.log('No 500 captured this run (burst may need more iterations / workers)');
  }

  await hostContext.close();
});

/**
 * Second variant: amplify the burst with more concurrency and a rejoin race.
 * Reuses the same shape, varies K and adds concurrent rejoins.
 */
test('captures 500 body from amplified concurrent join/leave burst', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120000);

  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const page500s: string[] = [];
  hostPage.on('response', async (res) => {
    if (res.status() >= 500) {
      const body = await res.text();
      page500s.push(`${res.url()} :: ${body}`);
    }
  });

  const player = new PlayerPage(hostPage, `Host2-${Date.now()}`, 'host');
  const roomCode = await player.createRoom();

  // Larger burst + some players rejoin after leaving to stress the ORM
  const K = 12;
  const names = Array.from(
    { length: K },
    (_, i) => `P${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  );
  const captured: Array<{ url: string; status: number; body: unknown }> = [];

  await Promise.all(
    names.map(async (name) => {
      let playerId: string | null = null;
      let playerSecret: string | null = null;
      for (let round = 0; round < 2; round++) {
        try {
          const jr = await joinRoom(roomCode, name, false);
          playerId = jr.id;
          playerSecret = jr.player_secret;
        } catch (err: any) {
          const r = err.response;
          if (r && r.status >= 500) {
            captured.push({ url: r.config?.url || '', status: r.status, body: r.data });
            console.log(`[500 JOIN BODY round ${round}] ${name}: ${JSON.stringify(r.data)}`);
            await testInfo.attach(`500-join-r${round}-${name}`, {
              body: JSON.stringify(r.data),
              contentType: 'application/json',
            });
          }
          if (r && r.status === 409) {
            const state = await getGameState(roomCode);
            const existing = Object.values(state.players || {}).find(
              (p: any) => p.name?.toLowerCase() === name.toLowerCase(),
            );
            if (existing) {
              playerId = existing.id;
              playerSecret = existing.player_secret;
            }
          }
        }
        if (playerSecret) {
          try {
            await axios.post(`${API_BASE}/players/${playerSecret}/leave_game/`, {
              player_secret: playerSecret,
            });
          } catch (err: any) {
            const r = err.response;
            if (r && r.status >= 500) {
              captured.push({ url: r.config?.url || '', status: r.status, body: r.data });
              console.log(`[500 LEAVE BODY round ${round}] ${name}: ${JSON.stringify(r.data)}`);
              await testInfo.attach(`500-leave-r${round}-${name}`, {
                body: JSON.stringify(r.data),
                contentType: 'application/json',
              });
            }
          }
          playerSecret = null; // force rejoin next round
        }
      }
    }),
  );

  if (captured.length > 0 || page500s.length > 0) {
    console.log(
      `REPRODUCED (amplified): ${captured.length} axios 500s, ${page500s.length} page 500s`,
    );
    testInfo.annotations.push({
      type: 'repro',
      description: `amplified burst: ${captured.length} axios, ${page500s.length} page`,
    });
  } else {
    console.log('No 500 captured in amplified run');
  }

  await hostContext.close();
});

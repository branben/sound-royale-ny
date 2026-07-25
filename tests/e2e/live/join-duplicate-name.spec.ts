import { test, expect } from '@playwright/test';
import axios from 'axios';
import { PlayerPage } from './pom/PlayerPage';
import { getGameState } from './helpers';

/**
 * E2E coverage for the join_game duplicate-name contract.
 *
 * Regression coverage for the systematic HTTP 500 that blocked the backend-
 * dependent live suite: a second join of an already-present player name must
 * return 409 (conflict_type=duplicate_name), never 500. This exercises the
 * REAL backend over HTTP (no mocks) — the layer the Django unit tests can't
 * fully prove (Postgres commit-ordering).
 *
 * Requires:
 *   - Backend running at 127.0.0.1:8000
 *   - Frontend running at localhost:8080
 *
 * Run with: LIVE_API_BASE_URL=http://127.0.0.1:8000/api npx playwright test tests/e2e/live/join-duplicate-name.spec.ts
 */

function getApiBaseUrl(): string {
  return process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';
}

test.describe('Live E2E — join_game duplicate name returns 409 (not 500)', () => {
  test('duplicate player name joins with 409 and room stays joinable', async ({ browser }) => {
    test.setTimeout(60000);

    const host = new PlayerPage(await browser.newPage(), 'HostPlayer', 'host');
    const roomCode = await host.createRoom();

    const producer = new PlayerPage(await browser.newPage(), 'Player2', 'producer');
    await producer.joinRoom(roomCode, false);

    // Second join with the SAME name "Player2" must be rejected as a conflict.
    // We call the API directly (bypassing the harness's idempotent 409 handling)
    // to assert the RAW backend status.
    let status = 0;
    let conflictType: string | undefined;
    try {
      await axios.post(`${getApiBaseUrl()}/rooms/${roomCode}/join_game/`, {
        name: 'Player2',
        is_spectator: false,
      });
    } catch (error: any) {
      status = error.response?.status;
      conflictType = error.response?.data?.conflict_type;
    }

    expect(status, 'duplicate-name join must be a 4xx conflict, never 500').toBe(409);
    expect(conflictType).toBe('duplicate_name');

    // Room must remain healthy: the original host + producer are still present.
    const state = await getGameState(roomCode);
    const names = Object.values(state.players || {}).map((p: any) => p.name);
    expect(names).toContain('HostPlayer');
    expect(names).toContain('Player2');
    // Exactly one Player2 — no duplicate row was created.
    expect(names.filter((n) => n === 'Player2')).toHaveLength(1);

    await host.page.close();
    await producer.page.close();
  });

  test('concurrent spectator joins never 409 (auto-number retries)', async ({ browser }) => {
    test.setTimeout(60000);

    const host = new PlayerPage(await browser.newPage(), 'HostPlayer', 'host');
    const roomCode = await host.createRoom();

    // Two spectators joining "simultaneously" must both succeed with distinct
    // auto-numbered names ("Spectator 1" / "Spectator 2"), never 409. We hit
    // the API directly (no page nav) so the assertion is about the backend
    // contract, not the harness. The Django unit test
    // test_join_game_spectator_concurrent_name_retries pins the same guarantee
    // at the unit layer; this confirms it over real HTTP/Postgres.
    const [r1, r2] = await Promise.all([
      axios.post(`${getApiBaseUrl()}/rooms/${roomCode}/join_game/`, {
        is_spectator: true,
      }),
      axios.post(`${getApiBaseUrl()}/rooms/${roomCode}/join_game/`, {
        is_spectator: true,
      }),
    ]);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    // Auto-numbering must produce exactly "Spectator 1" / "Spectator 2"
    // (distinct, sequential) — not a regression that emits "Spectator 3/4".
    expect([r1.data.name, r2.data.name].sort()).toEqual([
      'Spectator 1',
      'Spectator 2',
    ]);

    const state = await getGameState(roomCode);
    const spectatorNames = Object.values(state.players || {})
      .filter((p: any) => p.isSpectator)
      .map((p: any) => p.name)
      .sort();
    expect(spectatorNames).toEqual(['Spectator 1', 'Spectator 2']);

    await host.page.close();
  });
});

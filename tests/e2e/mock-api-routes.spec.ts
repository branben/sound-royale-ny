import { test, expect } from '@playwright/test';
import { enableE2EMode, mockApiRoutes } from './helpers';

test.describe('mockApiRoutes', () => {
  test('routes room actions before the generic room fetch mock', async ({ page }) => {
    await enableE2EMode(page);

    const calls = {
      room: 0,
      joinGame: 0,
      startGame: 0,
      kickPlayer: 0,
      vote: 0,
      toggleReady: 0,
      submitTile: 0,
    };

    await mockApiRoutes(page, {
      roomResponse: async (route) => {
        calls.room += 1;
        await route.fulfill({
          json: {
            code: '1234',
            status: 'lobby',
            current_round: 0,
            players: [],
          },
        });
      },
      joinGame: async (route) => {
        calls.joinGame += 1;
        await route.fulfill({ status: 201, json: { id: 'player-1', name: 'Player', is_spectator: false, is_host: false, player_secret: 'secret' } });
      },
      startGame: async (route) => {
        calls.startGame += 1;
        await route.fulfill({ json: { status: 'started' } });
      },
      kickPlayer: async (route) => {
        calls.kickPlayer += 1;
        await route.fulfill({ json: { status: 'kicked' } });
      },
      vote: async (route) => {
        calls.vote += 1;
        await route.fulfill({ json: { status: 'vote_recorded' } });
      },
      toggleReady: async (route) => {
        calls.toggleReady += 1;
        await route.fulfill({ json: { player_id: 'player-1', is_ready: true } });
      },
      submitTile: async (route) => {
        calls.submitTile += 1;
        await route.fulfill({ json: { status: 'ok' } });
      },
    });

    await page.goto('/');

    await page.evaluate(async () => {
      const base = 'http://localhost:8000/api';
      await fetch(`${base}/rooms/1234/join_game/`, { method: 'POST' });
      await fetch(`${base}/rooms/1234/start_game/`, { method: 'POST' });
      await fetch(`${base}/rooms/1234/kick_player/`, { method: 'POST' });
      await fetch(`${base}/rooms/1234/vote/`, { method: 'POST' });
      await fetch(`${base}/rooms/1234/toggle_ready/`, { method: 'POST' });
      await fetch(`${base}/tiles/tile-1/play_tile/`, { method: 'POST', body: new FormData() });
      await fetch(`${base}/rooms/1234/`);
    });

    expect(calls).toEqual({
      room: 1,
      joinGame: 1,
      startGame: 1,
      kickPlayer: 1,
      vote: 1,
      toggleReady: 1,
      submitTile: 1,
    });
  });
});

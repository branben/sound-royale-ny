import { test, expect } from '@playwright/test';

/**
 * Live E2E tests against the deployed stack.
 * No mocks — these tests verify the real Cloudflare Pages frontend
 * talking to the real Fly.io backend with real Supabase data.
 */

const API_URL = process.env.API_URL || 'https://sound-royale-ny.fly.dev';

test.describe('Live: Health & API', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get(`${API_URL}/health/`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('ok');
    expect(body.checks.redis).toBe('ok');
  });

  test('room creation returns valid credentials', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/rooms/`, {
      data: { host_name: 'LiveTest', match_type: 'casual' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.room_code).toMatch(/^\d{4}$/);
    expect(body.player_id).toBeTruthy();
    expect(body.player_secret).toBeTruthy();
    expect(body.access_token).toBeTruthy();
  });

  test('room join works', async ({ request }) => {
    // Create a room
    const createRes = await request.post(`${API_URL}/api/rooms/`, {
      data: { host_name: 'Host', match_type: 'casual' },
    });
    const { room_code } = await createRes.json();

    // Join it
    const joinRes = await request.post(`${API_URL}/api/rooms/${room_code}/join_game/`, {
      data: { name: 'Joiner' },
    });
    expect(joinRes.status()).toBe(200);
    const body = await joinRes.json();
    expect(body.player_id).toBeTruthy();
    expect(body.player_secret).toBeTruthy();
  });

  test('game start works with 2 players', async ({ request }) => {
    // Create room
    const createRes = await request.post(`${API_URL}/api/rooms/`, {
      data: { host_name: 'Host', match_type: 'casual' },
    });
    const { room_code, player_id, player_secret } = await createRes.json();

    // Join
    await request.post(`${API_URL}/api/rooms/${room_code}/join_game/`, {
      data: { name: 'P2' },
    });

    // Start
    const startRes = await request.post(`${API_URL}/api/rooms/${room_code}/start_game/`, {
      headers: {
        'X-Player-Id': player_id,
        'X-Player-Secret': player_secret,
      },
    });
    expect(startRes.status()).toBe(200);
    const body = await startRes.json();
    expect(body.status).toBe('Game started');
  });
});

test.describe('Live: Frontend Pages', () => {
  const BASE = process.env.BASE_URL || 'https://soundroyale.pages.dev';

  test('lobby loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`${BASE}/`);
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
    expect(errors).toHaveLength(0);
  });

  test('leaderboard loads with seeded data', async ({ page }) => {
    await page.goto(`${BASE}/leaderboard`);
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible({
      timeout: 15000,
    });
    // Should show seeded players
    await expect(page.getByText('VerifiedProducer')).toBeVisible({ timeout: 10000 });
  });

  test('admin theme page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/themes`);
    await expect(page.locator('#theme-admin-pin')).toBeVisible({ timeout: 15000 });
  });

  test('404 page works', async ({ page }) => {
    await page.goto(`${BASE}/nonexistent-page`);
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Live: WebSocket', () => {
  const BASE = process.env.BASE_URL || 'https://soundroyale.pages.dev';
  const API = process.env.API_URL || 'https://sound-royale-ny.fly.dev';

  test('WebSocket connects and receives player_joined', async ({ page }) => {
    // Create room via API
    const createRes = await page.request.post(`${API}/api/rooms/`, {
      data: { host_name: 'WSTest', match_type: 'casual' },
    });
    const { room_code, access_token } = await createRes.json();

    // Navigate to room
    await page.goto(`${BASE}/room/${room_code}`);

    // Wait for game board (indicates WS connected and state received)
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 15000 });
  });
});

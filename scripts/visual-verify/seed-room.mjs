#!/usr/bin/env node
/*
 * scripts/visual-verify/seed-room.mjs
 *
 * Creates a real Sound Royale room via the Django API and writes the creds the
 * frontend expects (localStorage keys) to seed.json. Used by capture.sh --seed
 * to render the auth-gated /room/:id route with a valid session.
 *
 * Requires the Django backend running (default http://localhost:8000).
 * The access_token/refresh_token returned map 1:1 to the keys GameContext reads
 * on mount (see src/services/api.ts: ACCESS_TOKEN_KEY / REFRESH_TOKEN_KEY).
 *
 * Usage:
 *   node seed-room.mjs [roomName] [apiBaseUrl]
 *   -> writes ./seed.json  { roomCode, accessToken, refreshToken }
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const roomName = process.argv[2] || 'visual-verify-seed';
const apiBase = process.argv[3] || process.env.SR_API_BASE_URL || 'http://localhost:8000/api';

const res = await fetch(`${apiBase}/rooms/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: roomName, player_name: 'SeedBot' }),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`seed-room FAILED: HTTP ${res.status}\n${body}`);
  process.exit(1);
}

const data = await res.json();
const out = {
  roomCode: data.room_code,
  accessToken: data.access_token,
  refreshToken: data.refresh_token,
};
fs.writeFileSync(path.join(__dirname, 'seed.json'), JSON.stringify(out, null, 2));
console.log(`seeded room ${out.roomCode} -> seed.json`);

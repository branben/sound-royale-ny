#!/usr/bin/env node
/**
 * SEC-1 URL-leak harness — reproduces issue #105 against the REAL frontend code.
 *
 * SEC-1 (security): the player secret must NEVER appear in a URL query string
 * (WebSocket connect URL or a GET request path). URLs are logged by browsers,
 * proxies, and server access logs, so a secret in the query string is exposed.
 * The fix is to carry the secret in an Authorization header, a POST body, or
 * the first WebSocket message instead. Tracked as issue #105.
 *
 * This harness stages the REAL repo sources (`src/services/gameSocket.ts` and
 * `src/services/api.ts`) rather than a copied snippet, so the gate stays honest
 * as the code evolves:
 *
 *   1. It reads the two real source files from SEC1_GAMESOCKET_TS / SEC1_API_TS
 *      (base64-decoded into the sandbox by the test), and
 *   2. exercises the exact URL-construction paths with a unique CANARY secret:
 *        - the WebSocket connect URL built by GameSocketService.getWsUrl(), and
 *        - the `/auth/discord/status/` GET path built by
 *          discordApi.getAccountStatus().
 *   3. It then asserts the CANARY does NOT land in either URL's query string.
 *
 * To keep the harness self-contained (no bundler / TS toolchain), the URL-
 * building logic is extracted from the real sources by locating the exact
 * lines the app uses and evaluating them in a tiny shim. If those lines can no
 * longer be found (the app was refactored), the harness FAILS LOUDLY rather
 * than silently passing — a green result must mean "the secret is provably not
 * in the URL", never "the check couldn't run".
 *
 * Output contract (parsed by the TestDriver test):
 *   Emits one `SEC1_RESULT=<json>` line to stdout, e.g.
 *     SEC1_RESULT={"canary":"...","leaks":[{"where":"ws","url":"..."}],"ok":false}
 *   Exit code: 0 when no leak (ok=true), 1 when the secret leaks (ok=false),
 *   2 when the harness could not locate the code under test.
 *
 * Usage:
 *   SEC1_GAMESOCKET_TS=/tmp/gameSocket.ts SEC1_API_TS=/tmp/api.ts \
 *     node sec1_url_harness.cjs
 */

const fs = require('fs');

function die(code, obj) {
  process.stdout.write('SEC1_RESULT=' + JSON.stringify(obj) + '\n');
  process.exit(code);
}

function readSource(envVar) {
  const p = process.env[envVar];
  if (!p || !fs.existsSync(p)) {
    die(2, {
      ok: false,
      error: `source for ${envVar} not found at ${p || '<unset>'}`,
    });
  }
  return fs.readFileSync(p, 'utf8');
}

// Unique, high-entropy canary so a substring match can't false-positive.
const CANARY = 'SEC1CANARY' + Math.random().toString(36).slice(2) + 'ZZ';
const PLAYER_ID = 'player-42';
const DISCORD_USER_ID = 'discord-99';

const gameSocketSrc = readSource('SEC1_GAMESOCKET_TS');
const apiSrc = readSource('SEC1_API_TS');

const leaks = [];
const checked = [];

// --- 1. WebSocket connect URL (gameSocket.ts -> getWsUrl) --------------------
//
// Reproduce getWsUrl() faithfully: build a URL to /ws/game/<id>/ and apply the
// same searchParams the real method applies. We extract the body of getWsUrl()
// from the real source and run it in a shim that provides `import.meta.env`
// (empty, forcing the localhost default), `this.options`, and URL.
try {
  const m = gameSocketSrc.match(/private\s+getWsUrl\s*\(\s*\)\s*:\s*string\s*\{([\s\S]*?)\n {2}\}/);
  if (!m) throw new Error('could not locate getWsUrl() in gameSocket.ts');

  // Strip TypeScript non-null assertions (`!`) so the body runs as plain JS.
  const body = m[1].replace(/this\.options!/g, 'this.options');

  // Shim `import.meta.env` (esbuild-style) by rewriting to a local object.
  const jsBody = body.replace(/import\.meta\.env/g, 'ENV');

  const fn = new Function(
    'ENV',
    'options',
    `const self = { options }; return (function(){ const _this = self; ${jsBody.replace(
      /this\./g,
      '_this.',
    )} })();`,
  );

  const wsUrl = fn(
    {}, // empty env -> falls back to http://localhost:8000
    {
      gameId: 'room-1',
      playerId: PLAYER_ID,
      playerSecret: CANARY,
      accessToken: null,
    },
  );

  checked.push({ where: 'ws', url: wsUrl });
  const q = new URL(wsUrl).search;
  if (q.includes(CANARY)) leaks.push({ where: 'ws', url: wsUrl });
} catch (err) {
  die(2, { ok: false, error: 'ws-path: ' + err.message });
}

// --- 2. GET /auth/discord/status/ path (api.ts -> getAccountStatus) ----------
//
// Extract the exact template literal the app passes to api.get(...) inside
// getAccountStatus and evaluate it with the canary secret.
try {
  const m = apiSrc.match(/getAccountStatus\s*:\s*async[\s\S]*?api\.get\(\s*(`[\s\S]*?`)\s*,?\s*\)/);
  if (!m) throw new Error('could not locate getAccountStatus api.get(...) in api.ts');

  const template = m[1];
  const fn = new Function('playerId', 'playerSecret', `return ${template};`);
  const path = fn(PLAYER_ID, CANARY);

  checked.push({ where: 'discord-status', url: path });
  // Everything after the first "?" is the query string.
  const qi = path.indexOf('?');
  const q = qi >= 0 ? path.slice(qi) : '';
  if (q.includes(CANARY)) leaks.push({ where: 'discord-status', url: path });
} catch (err) {
  die(2, { ok: false, error: 'discord-status-path: ' + err.message });
}

const ok = leaks.length === 0;
die(ok ? 0 : 1, { ok, canary: CANARY, checked, leaks });

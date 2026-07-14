/*
 * SEC-1 URL-leak harness.
 *
 * Runs INSIDE the TestDriver sandbox. It bundles the REAL frontend source
 * modules under review — src/services/gameSocket.ts and src/services/api.ts —
 * with esbuild, then drives the exact code paths that build the WebSocket
 * connect URL and the Discord account-status GET URL using a unique canary
 * secret. It prints the URLs those paths actually produce so the test can
 * assert the player secret never lands in a URL query string.
 *
 * External packages (axios) and browser globals (WebSocket, import.meta.env,
 * localStorage) are stubbed. The alias "@/..." is mapped to the staged src
 * root so the real modules — and their real local imports — are exercised
 * unmodified. Nothing in the source's URL-building logic is reimplemented here.
 *
 * Contract:
 *   CANARY=<value>  the secret value to probe for.
 *   SRC_ROOT=<dir>  the staged repo `src/` directory (contains services/, types/).
 *
 * Output (one JSON object on stdout, wrapped in SEC1_RESULT markers):
 *   { wsUrl, statusUrl, canary }
 */
'use strict';

const path = require('node:path');
const Module = require('node:module');

const CANARY = process.env.CANARY || 'CANARY_SECRET_VALUE';
const SRC_ROOT = process.env.SRC_ROOT;
if (!SRC_ROOT) {
  console.error('SRC_ROOT env var is required');
  process.exit(2);
}

// esbuild ships with the frontend deps (vite/rollup toolchain).
let esbuild;
try {
  esbuild = require('esbuild');
} catch (e) {
  console.error('ESBUILD_MISSING: ' + e.message);
  process.exit(3);
}

// ── Recorders ──────────────────────────────────────────────────────────────
const captured = { wsUrl: null, statusUrl: null };

// Stubbed WebSocket: records the URL passed to `new WebSocket(url)` and then
// throws so gameSocket's try/catch doesn't spin up real reconnect timers.
class RecordingWebSocket {
  constructor(url) {
    captured.wsUrl = String(url);
    throw new Error('SEC1_STOP_AFTER_URL_CAPTURE');
  }
}
RecordingWebSocket.OPEN = 1;
RecordingWebSocket.CLOSED = 3;

// Stubbed axios: records the URL passed to api.get(url) and rejects so the
// caller's await unwinds cleanly.
function makeAxiosStub() {
  const recordGet = (url) => {
    captured.statusUrl = String(url);
    return Promise.reject(new Error('SEC1_STOP_AFTER_URL_CAPTURE'));
  };
  const instance = {
    get: recordGet,
    post: () => Promise.reject(new Error('unused')),
    put: () => Promise.reject(new Error('unused')),
    delete: () => Promise.reject(new Error('unused')),
    patch: () => Promise.reject(new Error('unused')),
    interceptors: {
      request: { use: () => {} },
      response: { use: () => {} },
    },
    defaults: { headers: { common: {} } },
  };
  const axios = Object.assign((cfg) => recordGet(cfg && cfg.url), instance);
  axios.create = () => instance;
  axios.default = axios;
  return axios;
}

// ── Bundle a real source module to CJS, resolving the "@/" alias to SRC_ROOT,
//    stubbing axios, and injecting import.meta.env + browser globals. ────────
async function bundleModule(entryRelPath) {
  const entry = path.join(SRC_ROOT, entryRelPath);
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
    // Map "@/..." -> staged src root so real local imports resolve.
    alias: { '@': SRC_ROOT },
    // Keep axios external so our CJS stub is used instead of the real client.
    external: ['axios'],
    // Vite's import.meta.env — force the WS/API base so URL construction is
    // deterministic and independent of any ambient env.
    define: {
      'import.meta.env.VITE_WS_URL': '""',
      'import.meta.env.VITE_API_BASE_URL': '"http://localhost:8000/api"',
      'import.meta.env': '{}',
    },
  });
  const code = result.outputFiles[0].text;

  // Provide browser globals the source expects, without a full DOM.
  global.WebSocket = RecordingWebSocket;
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  if (typeof global.URL === 'undefined') global.URL = require('node:url').URL;

  // Compile the bundled CJS in a module whose require() returns our axios stub.
  const m = new Module(entry, null);
  m.filename = entry;
  m.paths = Module._nodeModulePaths(path.dirname(entry));
  const realRequire = m.require.bind(m);
  m.require = (id) => (id === 'axios' ? makeAxiosStub() : realRequire(id));
  m._compile(code, entry);
  return m.exports;
}

(async () => {
  // 1) Drive the REAL WebSocket URL builder via gameSocket.connect(). The
  //    RecordingWebSocket throws after capturing the URL; gameSocket swallows
  //    it in its try/catch, so we just read what it tried to connect to.
  try {
    const gs = await bundleModule(path.join('services', 'gameSocket.ts'));
    const gameSocket = gs.gameSocket || gs.default;
    gameSocket.connect({
      gameId: 'ROOM123',
      playerId: 'PLAYER123',
      playerSecret: CANARY,
      onMessage: () => {},
    });
    try {
      gameSocket.disconnect();
    } catch {}
  } catch (e) {
    console.error('WS_PATH_ERROR: ' + e.message);
  }

  // 2) Drive the REAL Discord status GET URL via discordApi.getAccountStatus().
  try {
    const apiMod = await bundleModule(path.join('services', 'api.ts'));
    const discordApi = apiMod.discordApi;
    await discordApi.getAccountStatus('PLAYER123', CANARY).catch(() => {});
  } catch (e) {
    console.error('STATUS_PATH_ERROR: ' + e.message);
  }

  const out = JSON.stringify({
    wsUrl: captured.wsUrl,
    statusUrl: captured.statusUrl,
    canary: CANARY,
  });
  console.log('SEC1_RESULT_START' + out + 'SEC1_RESULT_END');
})();

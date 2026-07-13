// SEC-1 regression guard (issue #105). See the block comment below for details.
// NOTE: this suite runs via vitest.testdriver.config.mjs (not the root vitest.config.ts).
import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

/**
 * SEC-1 regression guard — the player secret must never be exposed via a URL
 * OR a console / error string.
 *
 * Issue #105 (SEC-1): the per-player session secret (`player_secret`, the token
 * every authenticated request is signed with) is currently leaked in several
 * places. The SEC-1 review flags TWO exposure classes:
 *
 *   A) In a request URL
 *      - REST GET query string — src/services/api.ts (`getAccountStatus` builds
 *          `/auth/discord/status/?player_id=…&player_secret=…`)
 *      - WebSocket URL query param — src/services/gameSocket.ts
 *          (`url.searchParams.set('secret', playerSecret)`)
 *      - REST URL *path segment* — backend PlayerViewSet uses
 *          `lookup_field = "player_secret"` (backend/game_engine/views.py), so
 *          actions like `claim_bingo` / `toggle_ready` / `update_score` /
 *          `toggle_connection` route as `/api/players/<player_secret>/<action>/` —
 *          the secret sits in the PATH, not the query string.
 *
 *   B) In a console / error string
 *      - The axios error interceptor in src/services/api.ts auto-logs failed
 *          requests, forwarding `config.url` (which for `getAccountStatus` is the
 *          full `…/status/?player_secret=<uuid>` string) and `error.stack` — so a
 *          failed request prints/POSTs the secret into console + the error log.
 *      - Any `console.*` call that stringifies a URL, config, or error object
 *          carrying the secret leaks it into devtools / captured logs / crash
 *          reporters.
 *
 * Secrets in URLs leak into server access logs, browser history, and `Referer`
 * headers; secrets in console/error strings leak into devtools, log aggregators,
 * and crash reporters. Both are real credential-exposure bugs. The FIX (moving
 * the secret to an Authorization header / POST body / first WS message, and
 * scrubbing it from logged URLs/errors) is application code and lives in #105 —
 * it is intentionally NOT made here.
 *
 * ── Why this test inspects NETWORK REQUESTS + CONSOLE, not the address bar ────
 * The leak is NOT in the browser address bar — the secret never appears in
 * `location.href`. It leaks into:
 *   - the query string / path of an XHR/fetch request,
 *   - the WebSocket handshake URL,
 *   - and console / error output.
 * An address-bar / visual check would therefore pass even while the bug is
 * present. So this guard uses the Chrome DevTools Protocol to capture BOTH:
 *   1. every request URL the page issues
 *      (Network.requestWillBeSent + Network.webSocketWillSendHandshakeRequest /
 *       webSocketCreated), and
 *   2. every console message + browser log entry
 *      (Runtime.consoleAPICalled + Log.entryAdded),
 * and asserts the secret appears in none of them.
 *
 * ── How the leak is triggered deterministically ─────────────────────────────
 * The Lobby calls `getAccountStatus(playerId, playerSecret)` on mount whenever a
 * player session with a secret exists in storage. So we seed a *fake* session
 * (UUID-shaped id + secret) into localStorage and reload — that reproduces the
 * exact vulnerable `?player_secret=<uuid>` request with NO backend dependency
 * (the request URL is captured the moment it is sent, and because there is no
 * backend the request FAILS, which also exercises the error-logging interceptor
 * that prints the secret-bearing URL/stack to the console). We also drive the
 * create-room UI as a secondary signal.
 *
 * This test is EXPECTED TO FAIL until #105 lands (the seeded UUID shows up in a
 * captured request URL and/or console line), and to stay green afterwards.
 *
 * ── Target ──────────────────────────────────────────────────────────────────
 * No public deployment resolves (see tests/testdriver/smoke.test.mjs). The app
 * is a Vite frontend (port 8081) + Django backend (port 8000). This test builds
 * and serves the frontend *inside the TestDriver sandbox* and points the sandbox
 * browser at it. Override the base URL for a real deployment via SOUND_ROYALE_URL:
 *
 *   SOUND_ROYALE_URL=https://your-deploy.example \
 *     npx vitest run --config vitest.testdriver.config.mjs \
 *       tests/testdriver/sec1-player-secret-not-in-url.test.mjs
 */

const EXTERNAL_URL = process.env.SOUND_ROYALE_URL || null;
const APP_PORT = 8081;
const LOCAL_URL = `http://localhost:${APP_PORT}`;

// The fake secret/id we seed. UUID-shaped, matching what a real player_secret
// looks like, but unmistakable so we can grep for it in captured request URLs.
const FAKE_PLAYER_ID = "11111111-1111-4111-8111-111111111111";
// A clean, valid 8-4-4-4-12 UUID so the UUID-shape detector below is exercised
// against it too (not just the exact-string match), yet unmistakable in a log.
const FAKE_PLAYER_SECRET = "deadbeef-dead-4bee-8bad-c0ffee5ec1de";

// Generic UUID shape — a bare 8-4-4-4-12 token used as a query value OR sitting
// in the player-secret lookup path (/players/<uuid>/) is treated as a leaked
// secret even if the param name changes or the secret is routed via the path
// (backend lookup_field="player_secret"). See isLeak() below for the exact rules.
const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const URL_LOG = "/tmp/sec1-urls.log";
const CONSOLE_LOG = "/tmp/sec1-console.log";

// Return trimmed stdout from a sandbox command as a string.
async function sh(testdriver, cmd, timeout = 15000) {
  return String(await testdriver.exec("sh", cmd, timeout)).trim();
}

async function httpOk(testdriver, url) {
  const code = await sh(
    testdriver,
    `curl -sS -m 3 -o /dev/null -w '%{http_code}' ${url} || echo 000`,
  );
  return code.startsWith("2") || code === "304";
}

/**
 * Ensure the frontend is being served in the sandbox and return its base URL.
 * Prefers a production `vite preview` build (no backend needed, deterministic),
 * falls back to the dev server. When SOUND_ROYALE_URL is set, skip all of this.
 */
async function ensureAppRunning(testdriver) {
  if (EXTERNAL_URL) return EXTERNAL_URL;

  if (await httpOk(testdriver, LOCAL_URL)) return LOCAL_URL;

  // Find the repo checkout inside the sandbox.
  const repoDir = await sh(
    testdriver,
    'for d in /workspace "$HOME"/*/sound-royale-ny "$HOME"/sound-royale-ny /app; do ' +
      'if [ -f "$d/package.json" ]; then echo "$d"; break; fi; done',
  );
  const cd = repoDir ? `cd "${repoDir}"` : "cd /workspace 2>/dev/null || true";

  // Start the dev server (E2E flag renders public routes without a live backend).
  await sh(
    testdriver,
    [
      cd,
      "VITE_E2E_TESTING=true nohup npm run dev:frontend > /tmp/vite-sec1.log 2>&1 &",
      "echo started",
    ].join(" && "),
    60000,
  );

  for (let i = 0; i < 45; i++) {
    await testdriver.wait(2000);
    if (await httpOk(testdriver, LOCAL_URL)) return LOCAL_URL;
  }
  return LOCAL_URL; // let the assertions surface the real failure
}

/**
 * Attach a Chrome DevTools Protocol sniffer to the sandbox's Chrome
 * (remote-debugging port 9222) that records, for every open page target:
 *   - every request URL (XHR/fetch + WebSocket handshakes) -> /tmp/sec1-urls.log
 *   - every console message + browser log entry              -> /tmp/sec1-console.log
 * Runs a small Node CDP client inside the sandbox in the background. Enabling
 * Runtime + Log (in addition to Network) is what lets us catch SEC-1 exposure
 * class (B): the secret printed into a console / error string.
 */
async function startNetworkSniffer(testdriver) {
  const script = String.raw`
const http = require('http');
function get(path){return new Promise((res,rej)=>{http.get('http://127.0.0.1:9222'+path,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
function flat(v){
  try{
    if(v==null) return String(v);
    if(v.type==='string'||v.type==='number'||v.type==='boolean') return String(v.value);
    if(typeof v.value!=='undefined') return typeof v.value==='object'?JSON.stringify(v.value):String(v.value);
    if(v.description) return String(v.description);
    if(v.preview&&v.preview.properties) return v.preview.properties.map(p=>p.name+':'+p.value).join(',');
    return JSON.stringify(v);
  }catch(_){return '';}
}
(async()=>{
  const WebSocket = require('ws');
  const fs = require('fs');
  const urls = fs.createWriteStream('/tmp/sec1-urls.log',{flags:'a'});
  const cons = fs.createWriteStream('/tmp/sec1-console.log',{flags:'a'});
  let targets=[];
  try { targets = JSON.parse(await get('/json')); } catch(e){ urls.write('ERR list '+e+'\n'); }
  const pages = targets.filter(t=>t.webSocketDebuggerUrl);
  for (const p of pages){
    const ws = new WebSocket(p.webSocketDebuggerUrl,{perMessageDeflate:false});
    let id=0;
    ws.on('open',()=>{
      ws.send(JSON.stringify({id:++id,method:'Network.enable'}));
      ws.send(JSON.stringify({id:++id,method:'Runtime.enable'}));
      ws.send(JSON.stringify({id:++id,method:'Log.enable'}));
    });
    ws.on('message',m=>{
      try{
        const e=JSON.parse(m);
        if(e.method==='Network.requestWillBeSent') urls.write('REQ '+e.params.request.url+'\n');
        if(e.method==='Network.webSocketCreated') urls.write('WS '+e.params.url+'\n');
        if(e.method==='Network.webSocketWillSendHandshakeRequest') urls.write('WSH '+(e.params.request&&e.params.request.url||'')+'\n');
        if(e.method==='Runtime.consoleAPICalled'){
          const args=(e.params.args||[]).map(flat).join(' ');
          cons.write('CONSOLE['+e.params.type+'] '+args+'\n');
        }
        if(e.method==='Runtime.exceptionThrown'){
          const d=e.params.exceptionDetails||{};
          cons.write('EXCEPTION '+(d.text||'')+' '+((d.exception&&(d.exception.description||d.exception.value))||'')+'\n');
        }
        if(e.method==='Log.entryAdded'){
          const en=e.params.entry||{};
          cons.write('LOG['+en.level+'] '+(en.text||'')+' '+(en.url||'')+'\n');
        }
      }catch(_){}
    });
    ws.on('error',err=>urls.write('ERR ws '+err+'\n'));
  }
})();
`;
  // ws ships with the testdriverai sandbox toolchain; install locally if missing.
  await sh(
    testdriver,
    "cd /tmp && (node -e \"require('ws')\" 2>/dev/null || npm i ws >/tmp/ws-install.log 2>&1) ; " +
      `printf '%s' ${JSON.stringify(script)} > /tmp/sec1-sniffer.cjs && ` +
      `rm -f ${URL_LOG} ${CONSOLE_LOG} && nohup node /tmp/sec1-sniffer.cjs > /tmp/sec1-sniffer.log 2>&1 & echo sniffing`,
    60000,
  );
  await testdriver.wait(1500);
}

async function readLines(testdriver, path) {
  const raw = await sh(testdriver, `cat ${path} 2>/dev/null || echo ''`, 10000);
  return raw ? raw.split("\n").filter(Boolean) : [];
}

// Decide whether a single captured request-URL line leaks the player secret.
// Covers all three URL SEC-1 surfaces WITHOUT false-flagging legitimate resource
// UUIDs (a Room.id is a UUIDField and legitimately rides in `/ws/game/<id>/`
// and `/rooms/<id>/` paths — those must NOT be treated as leaks):
//
//   1. Query param NAME — `?player_secret=…` or `?secret=…` (any value).
//   2. Any UUID-shaped token used as a query VALUE — `?anything=<uuid>` — since a
//      secret in a query value is a leak regardless of the param name.
//   3. A UUID-shaped token in a PATH segment under a KNOWN secret-carrying route,
//      i.e. `/players/<uuid>/…` (the backend PlayerViewSet's
//      lookup_field="player_secret" routes the secret through the path here, e.g.
//      `/api/players/<secret>/claim_bingo/`). A bare UUID in an unrelated path (a
//      room/game id) is intentionally NOT flagged so the guard stays green after
//      #105 without false positives.
//   4. The exact seeded fake secret anywhere in the URL — the deterministic
//      trigger; this value is never a room/game id, so matching it anywhere is
//      always a true leak.
//
// The line is prefixed with a capture tag (REQ/WS/WSH); strip it first.
function isUrlLeak(line) {
  const url = line.replace(/^(REQ|WS|WSH)\s+/, "");
  // (2) UUID as a query value: `?x=<uuid>` or `&x=<uuid>`.
  const uuidQueryValue = new RegExp(`[?&][^=&]*=${UUID_RE}(?:[&#]|$)`, "i");
  // (3) UUID in the player-secret lookup path: `/players/<uuid>/` (also matches
  //     the trailing action, e.g. `/players/<uuid>/claim_bingo/`).
  const uuidSecretPath = new RegExp(`/players/${UUID_RE}(?:[/?#]|$)`, "i");
  return (
    /[?&]player_secret=/i.test(url) || // (1)
    /[?&]secret=/i.test(url) || // (1)
    uuidQueryValue.test(url) || // (2)
    uuidSecretPath.test(url) || // (3)
    url.includes(FAKE_PLAYER_SECRET) // (4)
  );
}

// Decide whether a captured console / log / exception line leaks the secret
// (SEC-1 exposure class B). We match, unambiguously:
//   1. The exact seeded secret anywhere in the console text — this value is only
//      ever the player_secret, so any occurrence is a true leak (e.g. the error
//      interceptor printing `config.url`/`error.stack` that contains it).
//   2. A `player_secret=` / `secret=` query fragment printed in console text —
//      i.e. a secret-bearing URL logged verbatim.
// We deliberately do NOT flag a bare UUID in console text: React/Vite dev noise
// and legitimate room/game ids surface UUIDs in console output, and flagging
// those would make the guard flaky and false-positive after #105 lands.
function isConsoleLeak(line) {
  return (
    line.includes(FAKE_PLAYER_SECRET) || // (1)
    /[?&]player_secret=/i.test(line) || // (2)
    /[?&]secret=/i.test(line) // (2)
  );
}

describe("SEC-1 — player secret is never exposed in a request URL or console/error string", () => {
  it("does not leak player_secret into any request URL (REST query / REST path / WS handshake) or console/error output", async (context) => {
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: "about:blank" });

    const baseUrl = await ensureAppRunning(testdriver);

    // Start capturing network request URLs + console/log output before the app
    // makes any request or prints anything.
    await startNetworkSniffer(testdriver);

    // Load the lobby.
    await testdriver.provision.chrome({ url: baseUrl });
    await testdriver.wait(4000);

    const lobbyVisible = await testdriver.assert(
      "the Sound Royale lobby / landing page is visible with a way to create or join a battle room",
    );
    expect(lobbyVisible).toBeTruthy();

    // ── Deterministic trigger ────────────────────────────────────────────────
    // Seed a fake player session so the Lobby's mount effect calls
    // getAccountStatus(playerId, playerSecret) — the vulnerable request. This
    // needs no backend: the request URL is captured the moment it is sent, and
    // because the request then FAILS (no backend) it also drives the axios error
    // interceptor that logs the secret-bearing URL/stack to the console.
    await sh(
      testdriver,
      // Drive Chrome via CDP Runtime.evaluate to set localStorage on the page.
      buildSeedCmd(baseUrl),
      20000,
    );
    // Reload so the app boots with the seeded session and fires getAccountStatus.
    await testdriver.provision.chrome({ url: baseUrl });
    await testdriver.wait(5000);

    // ── Secondary signal: drive the create-room UI (mints a real secret and
    // opens the websocket). Forgiving so it survives copy changes / no backend.
    const nameField = await testdriver.find(
      "the text input for entering a player name / nickname",
      { timeout: 20000 },
    );
    if (nameField.found()) {
      await nameField.click();
      await testdriver.type("SecTester");
      await testdriver.wait(500);
      const createButton = await testdriver.find(
        "the button to create a new room / battle (e.g. 'Create Room' or 'Create Battle')",
        { timeout: 20000 },
      );
      if (createButton.found()) {
        await createButton.click();
        await testdriver.wait(6000);
      }
    }

    // ── SEC-1 assertion (A): inspect every captured request URL ──────────────
    const urls = await readLines(testdriver, URL_LOG);
    const urlOffenders = urls.filter(isUrlLeak);

    expect(
      urlOffenders,
      `player_secret / secret leaked into request URL(s):\n${urlOffenders.join(
        "\n",
      )}\n\n(captured ${urls.length} request URLs total)`,
    ).toEqual([]);

    // ── SEC-1 assertion (B): inspect every captured console / log / exception ─
    const consoleLines = await readLines(testdriver, CONSOLE_LOG);
    const consoleOffenders = consoleLines.filter(isConsoleLeak);

    expect(
      consoleOffenders,
      `player_secret / secret leaked into console / error output:\n${consoleOffenders.join(
        "\n",
      )}\n\n(captured ${consoleLines.length} console/log lines total)`,
    ).toEqual([]);

    // Visual / AI backstop on the address bar (cheap extra guard).
    const noSecretInBar = await testdriver.assert(
      "the browser address bar does NOT contain a 'player_secret' or 'secret' query parameter and does NOT contain any long UUID-style token (8-4-4-4-12 hex)",
    );
    expect(noSecretInBar).toBeTruthy();
  });
});

// Build a shell command that uses CDP Runtime.evaluate to seed localStorage with
// a fake player session on the currently open page.
function buildSeedCmd(baseUrl) {
  const js = [
    `localStorage.setItem('playerName','SecTester');`,
    `localStorage.setItem('playerId','${FAKE_PLAYER_ID}');`,
    `localStorage.setItem('playerSecret','${FAKE_PLAYER_SECRET}');`,
    `'seeded'`,
  ].join("");
  const node = String.raw`
const http=require('http');
function get(p){return new Promise((res,rej)=>{http.get('http://127.0.0.1:9222'+p,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const WebSocket=require('ws');
  const targets=JSON.parse(await get('/json'));
  const page=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);
  if(!page){console.log('no page');return;}
  const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});
  await new Promise(r=>ws.on('open',r));
  ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:${JSON.stringify(
    js,
  )}}}));
  await new Promise(r=>setTimeout(r,800));
  console.log('seeded');
  ws.close();
})().catch(e=>console.log('ERR',e));
`;
  return (
    "cd /tmp && (node -e \"require('ws')\" 2>/dev/null || npm i ws >/dev/null 2>&1) ; " +
    `printf '%s' ${JSON.stringify(node)} > /tmp/sec1-seed.cjs && node /tmp/sec1-seed.cjs`
  );
}

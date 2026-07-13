// SEC-1 regression guard (issue #105). See the block comment below for details.
// NOTE: this suite runs via vitest.testdriver.config.mjs (not the root vitest.config.ts).
import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

/**
 * SEC-1 regression guard — the player secret must never be exposed via a URL.
 *
 * Issue #105 (SEC-1): the per-player session secret (`player_secret`, the token
 * every authenticated request is signed with) is currently leaked into the URLs
 * of requests the app makes:
 *
 *   - REST GET query string — src/services/api.ts (`getAccountStatus` builds
 *       `/auth/discord/status/?player_id=…&player_secret=…`)
 *   - WebSocket URL query param — src/services/gameSocket.ts
 *       (`url.searchParams.set('secret', playerSecret)`)
 *   - REST URL *path segment* — backend PlayerViewSet uses
 *       `lookup_field = "player_secret"` (backend/game_engine/views.py), so
 *       actions like `claim_bingo` / `toggle_ready` / `update_score` /
 *       `toggle_connection` route as `/api/players/<player_secret>/<action>/` —
 *       the secret sits in the PATH, not the query string. (This is the surface
 *       the SEC-1 review comment on views.py flags.)
 *
 * Secrets in URLs leak into server access logs, browser history, and `Referer`
 * headers, so this is a real credential-exposure bug. The FIX (moving the secret
 * to an Authorization header / POST body / first WS message) is application code
 * and lives in #105 — it is intentionally NOT made here.
 *
 * ── Why this test inspects NETWORK REQUESTS, not the address bar ─────────────
 * The leak is NOT in the browser address bar — the secret never appears in
 * `location.href`. It leaks into the query string of an *XHR/fetch* request
 * (`GET …/status/?player_secret=…`), into a *URL path segment* of an XHR/fetch
 * request (`…/api/players/<secret>/claim_bingo/`), and into the *WebSocket
 * handshake URL* (`ws://…/ws/game/…/?secret=…`). An address-bar / visual check
 * would therefore pass even while the bug is present. So this guard captures
 * **every request URL the page issues** via the Chrome DevTools Protocol
 * (Network.requestWillBeSent + Network.webSocketWillSendHandshakeRequest /
 * webSocketCreated) and asserts the secret appears in none of them — whether in
 * a query param OR a path segment.
 *
 * ── How the leak is triggered deterministically ─────────────────────────────
 * The Lobby calls `getAccountStatus(playerId, playerSecret)` on mount whenever a
 * player session with a secret exists in storage. So we seed a *fake* session
 * (UUID-shaped id + secret) into localStorage and reload — that reproduces the
 * exact vulnerable `?player_secret=<uuid>` request with NO backend dependency
 * (the request is captured the moment it is sent, regardless of the response).
 * We also drive the create-room UI as a secondary signal.
 *
 * This test is EXPECTED TO FAIL until #105 lands (the seeded UUID shows up in a
 * captured request URL), and to stay green afterwards.
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
 * Attach a Chrome DevTools Protocol network sniffer to the sandbox's Chrome
 * (remote-debugging port 9222) and record every request URL — XHR/fetch AND
 * WebSocket handshakes — into /tmp/sec1-urls.log until we stop it. Runs a small
 * Node CDP client inside the sandbox in the background.
 */
async function startNetworkSniffer(testdriver) {
  const script = String.raw`
const http = require('http');
function get(path){return new Promise((res,rej)=>{http.get('http://127.0.0.1:9222'+path,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const WebSocket = require('ws');
  const fs = require('fs');
  const out = fs.createWriteStream('/tmp/sec1-urls.log',{flags:'a'});
  let targets=[];
  try { targets = JSON.parse(await get('/json')); } catch(e){ out.write('ERR list '+e+'\n'); }
  const pages = targets.filter(t=>t.webSocketDebuggerUrl);
  for (const p of pages){
    const ws = new WebSocket(p.webSocketDebuggerUrl,{perMessageDeflate:false});
    let id=0;
    ws.on('open',()=>{ ws.send(JSON.stringify({id:++id,method:'Network.enable'})); });
    ws.on('message',m=>{
      try{
        const e=JSON.parse(m);
        if(e.method==='Network.requestWillBeSent') out.write('REQ '+e.params.request.url+'\n');
        if(e.method==='Network.webSocketCreated') out.write('WS '+e.params.url+'\n');
        if(e.method==='Network.webSocketWillSendHandshakeRequest') out.write('WSH '+(e.params.request&&e.params.request.url||'')+'\n');
      }catch(_){}
    });
    ws.on('error',err=>out.write('ERR ws '+err+'\n'));
  }
})();
`;
  // ws ships with the testdriverai sandbox toolchain; install locally if missing.
  await sh(
    testdriver,
    "cd /tmp && (node -e \"require('ws')\" 2>/dev/null || npm i ws >/tmp/ws-install.log 2>&1) ; " +
      `printf '%s' ${JSON.stringify(script)} > /tmp/sec1-sniffer.cjs && ` +
      "rm -f /tmp/sec1-urls.log && nohup node /tmp/sec1-sniffer.cjs > /tmp/sec1-sniffer.log 2>&1 & echo sniffing",
    60000,
  );
  await testdriver.wait(1500);
}

async function readCapturedUrls(testdriver) {
  const raw = await sh(testdriver, "cat /tmp/sec1-urls.log 2>/dev/null || echo ''", 10000);
  return raw ? raw.split("\n").filter(Boolean) : [];
}

// Decide whether a single captured request-URL line leaks the player secret.
// Covers all three SEC-1 surfaces WITHOUT false-flagging legitimate resource
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
function isLeak(line) {
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

describe("SEC-1 — player secret is never exposed in a request URL", () => {
  it("does not leak player_secret into any request URL (REST query / REST path / WS handshake)", async (context) => {
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: "about:blank" });

    const baseUrl = await ensureAppRunning(testdriver);

    // Start capturing network request URLs before the app makes any.
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
    // needs no backend: we only care that the request URL is *emitted*.
    // The lobby is already loaded (above), so set the legacy session keys the
    // app reads on startup directly on the open page via CDP, then reload.
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

    // ── Core SEC-1 assertion: inspect every captured request URL ─────────────
    const urls = await readCapturedUrls(testdriver);

    const offenders = urls.filter(isLeak);

    expect(
      offenders,
      `player_secret / secret leaked into request URL(s):\n${offenders.join(
        "\n",
      )}\n\n(captured ${urls.length} request URLs total)`,
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

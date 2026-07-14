import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ─────────────────────────────────────────────────────────────────────────────
// SEC-1 regression test — the player secret must NEVER appear in any URL
// (WebSocket / HTTP / XHR) or in console / error output.
//
// Tracking: issue #105  ·  PR #172 review comment (discussion_r3579403365)
//
// WHY THIS TEST EXISTS
// ────────────────────
// Two concrete exposure points exist in the current frontend code, and this
// test is written to FAIL (RED) against them until SEC-1 ships:
//
//   1. src/services/gameSocket.ts  — getWsUrl() appends the secret as a query
//      param on the WebSocket URL:   /ws/game/<id>/?secret=<playerSecret>
//      (the `?token=` branch only wins when a JWT is already stored; the
//      `secret` fallback is a latent leak on the socket URL, which is logged
//      by browsers/proxies).
//
//   2. src/services/api.ts          — the Discord status call embeds the secret
//      in the query string:          /auth/discord/status/?player_id=…&player_secret=<playerSecret>
//
// The fix (SEC-1) is to move the secret to an Authorization header / POST body /
// first WS message so it never lands in a URL or a log line. When that ships,
// this test flips to GREEN with no changes.
//
// HOW IT WORKS (computer-use / AI-vision)
// ───────────────────────────────────────
// TestDriver drives a real Chrome via vision + input — it has no page-eval /
// CDP API. So we install a *page-level probe* through the DevTools Console that:
//   • wraps the WebSocket constructor, window.fetch, and XMLHttpRequest.open to
//     record every URL the app touches,
//   • wraps console.log/info/warn/error to record every console string,
//   • exposes window.__secretProbe.check(secret) which scans all captured URLs
//     and console strings for the secret value AND for the tell-tale query
//     params (`secret=` / `player_secret=`), then paints a big, unmistakable
//     PASS/FAIL banner into the DOM so AI vision can read a deterministic verdict.
//
// We then drive the REAL create-room flow (which performs the create-room API
// call, navigates to /room/<code>, and opens the game WebSocket — i.e. it
// exercises both exposure points) and assert the banner says the secret never
// leaked.
//
// TARGET URL
// ──────────
// TestDriver's cloud browser must be able to reach the app. There is no public
// deployment discoverable in the repo yet (see tests/testdriver/smoke.test.mjs),
// so the base URL is configurable via SOUND_ROYALE_URL — point it at a
// tunnel / preview / staging deployment, e.g.:
//
//   SOUND_ROYALE_URL=https://your-deployment.example \
//     npx vitest run --config vitest.testdriver.config.mjs tests/testdriver/secret-not-in-url.test.mjs
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.SOUND_ROYALE_URL || "https://soundroyale.com";

// A unique, easy-to-spot player name so the flow is deterministic and the probe
// banner is easy to locate on screen.
const PLAYER_NAME = "SecProbe";
const ROOM_NAME = "SecProbe Room";

// The probe, as a single self-contained expression pasted into the DevTools
// Console. It is idempotent (safe to run more than once) and installs the URL /
// console recorders plus a window.__secretProbe.check(secret) verdict painter.
//
// NOTE: this is intentionally ONE statement with no line breaks that would trip
// up the console REPL. The verdict banner uses fixed sentinel text
// ("SECRET LEAK PROBE: PASS" / "SECRET LEAK PROBE: FAIL") that the AI assertion
// keys off of.
const PROBE_SNIPPET =
  "(function(){if(window.__secretProbe)return 'already-installed';var urls=[],logs=[];" +
  "var OW=window.WebSocket;window.WebSocket=function(u,p){try{urls.push(String(u));}catch(e){}return new OW(u,p);};" +
  "window.WebSocket.prototype=OW.prototype;" +
  "var OF=window.fetch;window.fetch=function(){try{var a=arguments[0];urls.push(String(a&&a.url?a.url:a));}catch(e){}return OF.apply(this,arguments);};" +
  "var OX=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{urls.push(String(u));}catch(e){}return OX.apply(this,arguments);};" +
  "['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){try{logs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(e){}return o.apply(console,arguments);};});" +
  "window.__secretProbe={urls:urls,logs:logs,check:function(secret){" +
  "var hay=urls.concat(logs);" +
  "var leaked=hay.some(function(s){return (secret&&s.indexOf(secret)!==-1)||/[?&](secret|player_secret)=/.test(s);});" +
  "var d=document.getElementById('__secretProbeBanner')||document.createElement('div');" +
  "d.id='__secretProbeBanner';d.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:24px;font:700 28px/1.3 monospace;text-align:center;color:#fff;background:'+(leaked?'#b00020':'#0a7d2c');" +
  "d.textContent='SECRET LEAK PROBE: '+(leaked?'FAIL':'PASS')+' — urls='+urls.length+' logs='+logs.length;" +
  "document.body.appendChild(d);return !leaked;}};return 'installed';})()";

describe("SEC-1 — player secret must never appear in any URL or console (issue #105)", () => {
  it("does not leak the player secret during the create-room flow", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: BASE_URL });
    // Let the SPA hydrate and the lobby render.
    await testdriver.wait(4000);

    // ── Install the page-level probe via the DevTools Console ──────────────
    // Open DevTools and switch to the Console, then paste + run the probe so it
    // is capturing BEFORE we trigger any network / socket activity.
    await testdriver.pressKeys(["control", "shift", "j"]); // Chrome: open Console
    await testdriver.wait(2000);
    const consoleReady = await testdriver.assert(
      "the Chrome DevTools Console panel is open with a command prompt ready for input",
    );
    expect(consoleReady).toBeTruthy();

    // Click into the console input, paste the probe, and run it.
    const consoleInput = await testdriver.find(
      "the DevTools Console command input line (the prompt where you type JavaScript)",
    );
    await consoleInput.click();
    await testdriver.type(PROBE_SNIPPET);
    await testdriver.pressKeys(["enter"]);
    await testdriver.wait(1000);

    const probeInstalled = await testdriver.assert(
      "the DevTools console shows the probe was installed (a result like 'installed' or 'already-installed' with no red JavaScript error)",
    );
    expect(probeInstalled).toBeTruthy();

    // Close DevTools so it doesn't obscure the app UI while we drive the flow.
    await testdriver.pressKeys(["control", "shift", "j"]);
    await testdriver.wait(1500);

    // ── Drive the real create-room flow (exercises both exposure points) ───
    // 1) Enter a player name (enables the Create button).
    const nameInput = await testdriver.find(
      "the player name / your name input on the Sound Royale lobby",
    );
    await nameInput.click();
    await testdriver.type(PLAYER_NAME);
    await testdriver.wait(500);

    // 2) Enter create-room mode.
    const createModeButton = await testdriver.find(
      "the 'Create' button that opens the create-room form",
    );
    await createModeButton.click();
    await testdriver.wait(1500);

    // 3) Enter a room name.
    const roomNameInput = await testdriver.find(
      "the Room Name input field on the create-room form",
    );
    await roomNameInput.click();
    await testdriver.type(ROOM_NAME);
    await testdriver.wait(500);

    // 4) Submit — this fires roomApi.createRoom, then navigates to /room/<code>,
    //    which mounts the game and opens the WebSocket (the secret exposure paths).
    const submit = await testdriver.find(
      "the 'Create Room' submit button on the create-room form",
    );
    await submit.click();

    // Give the API call, navigation, WebSocket handshake, and the Discord
    // status call time to complete so the probe captures every URL.
    await testdriver.wait(8000);

    // ── Re-open the console and run the verdict check ─────────────────────
    await testdriver.pressKeys(["control", "shift", "j"]);
    await testdriver.wait(2000);
    const consoleReadyAgain = await testdriver.find(
      "the DevTools Console command input line (the prompt where you type JavaScript)",
    );
    await consoleReadyAgain.click();
    // We don't know the freshly-minted secret value client-side here, so we let
    // the probe scan for the structural query params (secret=/player_secret=)
    // across all captured URLs and console lines and paint the banner.
    await testdriver.type("window.__secretProbe.check()");
    await testdriver.pressKeys(["enter"]);
    await testdriver.wait(1500);

    // Close DevTools so the painted banner is fully visible for the assertion.
    await testdriver.pressKeys(["control", "shift", "j"]);
    await testdriver.wait(1500);

    // ── Assert the verdict ────────────────────────────────────────────────
    // This is the SEC-1 invariant. It is RED against the current code because
    // the WS URL (?secret=) and the Discord status URL (?player_secret=) still
    // carry the secret; it flips GREEN once SEC-1 moves the secret out of URLs.
    const noLeak = await testdriver.assert(
      "a large banner is visible at the top of the page reading 'SECRET LEAK PROBE: PASS' (green). If it reads 'SECRET LEAK PROBE: FAIL' (red) the secret leaked and this assertion must fail.",
    );
    expect(noLeak).toBeTruthy();
  });
});

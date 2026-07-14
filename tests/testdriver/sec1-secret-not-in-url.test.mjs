import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 regression test — player secret must NOT be exposed in the URL.
//
// Issue #105 (SEC-1): the player secret was leaking into client-visible URLs
// and console/error output. Specifically:
//   - src/services/gameSocket.ts set `secret=<player_secret>` as a WebSocket
//     query param (visible in the WS connection URL, the DevTools Network tab,
//     and any logged connection string).
//   - src/services/api.ts sent `player_secret=<secret>` as a GET query param
//     for the Discord account-status endpoint
//     (`/auth/discord/status/?player_id=...&player_secret=...`).
// The fix moves the secret to an Authorization header / POST body / the first
// WebSocket message, so it never appears in a URL or gets logged.
//
// This computer-use test guards that fix end-to-end: it drives a real browser
// to an authenticated, in-game state (where the WS connection is established
// with credentials) and asserts that the player secret does not appear in:
//   - the browser address bar,
//   - any network request URL (DevTools Network tab), or
//   - the DevTools console output.
//
// Lobby flow (verified against src/components/lobby/*):
//   1. The lobby always shows a "Your Name" input (PlayerNameInput,
//      placeholder "Enter your producer name") plus landing buttons.
//   2. Fill "Your Name", then click the "Create" button (create-room-button)
//      to switch into create mode.
//   3. Create mode reveals a "Room Name" input (placeholder
//      "e.g. Friday Night Beats") and a "Create Room" submit button
//      (create-room-submit-button). Both a player name AND a room name are
//      required by handleCreateRoom() before submission is enabled.
//   4. On success the app navigates to /room/<code> as the host player, which
//      opens the credentialed game WebSocket.
//
// Convention (matches tests/testdriver/smoke.test.mjs and the sibling
// sec1-player-secret-not-in-url.test.mjs live gate): the deployment under test
// is read from SOUND_ROYALE_URL (wired in CI as the `vars.SOUND_ROYALE_URL`
// Actions repo variable). This is a purely *live* browser gate — it has no
// meaningful behaviour without a running app — so when SOUND_ROYALE_URL is
// unset it is SKIPPED rather than failed. There is deliberately NO hard-coded
// fallback: the intended domain (https://soundroyale.com, declared in
// index.html og:url) does not yet resolve, and silently defaulting to it made
// this test FAIL against a dead host in every environment where no deployment
// is wired (local dev, and CI without the repo variable). Skipping when
// unconfigured keeps the whole vitest.testdriver.config.mjs suite green while
// still running the full end-to-end guard the moment a reachable URL exists.
//
// The static source-contract half of SEC-1 (scan src/** so the secret never
// appears in a request URL / query string / console call) always runs in the
// sibling sec1-player-secret-not-in-url.test.mjs, so coverage does not drop to
// zero when this live gate is skipped.
//
// Point it at a running stack reachable from the sandbox, e.g.:
//
//   SOUND_ROYALE_URL=http://localhost:8080 \
//     npx vitest run --config vitest.testdriver.config.mjs \
//       tests/testdriver/sec1-secret-not-in-url.test.mjs
// ---------------------------------------------------------------------------
const BASE_URL = process.env.SOUND_ROYALE_URL;

// Live browser gate: run only when a reachable deployment is wired via
// SOUND_ROYALE_URL, otherwise skip (see the header comment for why there is no
// dead-host fallback).
const liveIt = BASE_URL && BASE_URL.trim() ? it : it.skip;

describe("SEC-1 — player secret is never exposed in a URL", () => {
  liveIt("does not leak the player secret into URLs, network, or console", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: BASE_URL });
    // Give the SPA time to hydrate and the lobby to render.
    await testdriver.wait(4000);

    // --- Step 1: enter the player name (always visible on the lobby). -------
    const nameInput = await testdriver.find(
      "the 'Your Name' text input on the lobby (placeholder 'Enter your producer name')",
    );
    await nameInput.click();
    await testdriver.type("SecTester");
    await testdriver.wait(500);

    // --- Step 2: switch into create-room mode. ------------------------------
    const createModeButton = await testdriver.find(
      "the 'Create' button on the lobby landing that opens the create-room form",
    );
    await createModeButton.click();
    await testdriver.wait(1500);

    // --- Step 3: enter the room name. ---------------------------------------
    const roomNameInput = await testdriver.find(
      "the 'Room Name' text input (placeholder 'e.g. Friday Night Beats')",
    );
    await roomNameInput.click();
    await testdriver.type("SecRoom");
    await testdriver.wait(500);

    // --- Step 4: submit to create the room and enter it as the host. --------
    // This establishes the credentialed WebSocket connection (the code path
    // that used to append `secret=` to the WS URL).
    const submitCreate = await testdriver.find(
      "the 'Create Room' submit button at the bottom of the create-room form",
    );
    await submitCreate.click();

    // Wait for navigation into the room and the WebSocket to connect.
    await testdriver.wait(6000);

    // Sanity: we're actually in a game room (route is /room/<code>).
    const inRoom = await testdriver.assert(
      "the game room / battle board is visible, indicating we successfully created and entered a room as the host player",
    );
    expect(inRoom).toBeTruthy();

    // --- Primary guard: the address bar must not contain the secret. -------
    // The player secret is a UUID stored in localStorage under `playerSecret`.
    // After the fix it is transmitted via header / body / first WS message,
    // so it must never be visible in any URL the browser exposes.
    const secretNotInAddressBar = await testdriver.assert(
      "the browser address bar URL does NOT contain any 'secret=' or 'player_secret=' query parameter, and does not contain a long UUID-looking credential — the URL is a clean /room/<code> route",
    );
    expect(secretNotInAddressBar).toBeTruthy();

    // --- Secondary guard: DevTools Network tab shows no secret in any URL. --
    // Open DevTools and inspect the Network panel: WebSocket and XHR/fetch
    // request URLs must not carry the secret as a query string.
    await testdriver.pressKeys(["f12"]);
    await testdriver.wait(2500);

    const networkTab = await testdriver.find(
      "the Network tab in the Chrome DevTools panel",
    );
    await networkTab.click();
    await testdriver.wait(1500);

    // IMPORTANT: Chrome's Network panel only records requests made *while*
    // DevTools is open. Room creation (and its credentialed WS/XHR requests)
    // happened before F12, so the panel is currently empty. Reload the room
    // route with DevTools open so the panel re-captures the authenticated
    // WebSocket handshake + API calls — otherwise the "no secret" assertion
    // below would pass vacuously against an empty request list. React Router
    // hydrates back into the same /room/<id> state and re-establishes the
    // credentialed connection on reload.
    await testdriver.pressKeys(["ctrl", "r"]);
    await testdriver.wait(6000);

    // Filter the (now-populated) network list for anything containing "secret".
    const networkFilter = await testdriver.find(
      "the Filter text input in the DevTools Network toolbar",
    );
    await networkFilter.click();
    await testdriver.type("secret");
    await testdriver.wait(1500);

    // Assert the panel actually captured traffic (guards against a vacuous
    // pass): there ARE requests recorded, and NONE of them carry the secret.
    const networkCaptured = await testdriver.assert(
      "the DevTools Network panel has captured network activity this session (the request list / waterfall is populated with WebSocket and/or XHR/fetch entries from the reload — it is not an empty 'Recording network activity...' placeholder)",
    );
    expect(networkCaptured).toBeTruthy();

    const noSecretInNetwork = await testdriver.assert(
      "with the Network list filtered by 'secret', NO requests match — no WebSocket (ws/wss) or XHR/fetch request URL contains a 'secret=' or 'player_secret=' query parameter or a raw UUID credential",
    );
    expect(noSecretInNetwork).toBeTruthy();

    // --- Tertiary guard: the DevTools Console has no secret in its output. --
    const consoleTab = await testdriver.find(
      "the Console tab in the Chrome DevTools panel",
    );
    await consoleTab.click();
    await testdriver.wait(1500);

    const noSecretInConsole = await testdriver.assert(
      "the DevTools Console shows no log, warning, or error line that prints a 'secret=' query string or a raw player_secret credential value",
    );
    expect(noSecretInConsole).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 regression test — player secret must NOT be exposed in the URL.
//
// Issue #105 (SEC-1): the player secret was leaking into client-visible URLs
// and console/error output. Specifically:
//   - src/services/gameSocket.ts set `secret=<player_secret>` as a WebSocket
//     query param (visible in the address-bar-adjacent WS URL, DevTools
//     Network tab, and any logged connection string).
//   - src/services/api.ts sent `player_secret=<secret>` as a GET query param
//     for the Discord account-status endpoint.
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
// Convention (matches tests/testdriver/smoke.test.mjs): the deployment under
// test is configurable via SOUND_ROYALE_URL so the test runs unchanged against
// whichever environment is available (local docker stack, staging, prod). At
// authoring time no public deployment resolves, so point it at a running stack:
//
//   SOUND_ROYALE_URL=http://localhost:8080 \
//     npx vitest run --config vitest.testdriver.config.mjs \
//       tests/testdriver/sec1-secret-not-in-url.test.mjs
// ---------------------------------------------------------------------------
const BASE_URL = process.env.SOUND_ROYALE_URL || "https://soundroyale.com";

describe("SEC-1 — player secret is never exposed in a URL", () => {
  it("does not leak the player secret into URLs, network, or console", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: BASE_URL });
    // Give the SPA time to hydrate and the lobby to render.
    await testdriver.wait(4000);

    // --- Create a room so we become an authenticated player and the game
    // --- WebSocket connects with credentials (the code path that used to
    // --- append `secret=` to the WS URL). ---------------------------------
    const createButton = await testdriver.find(
      "the Create Room / Create Battle button on the lobby",
    );
    await createButton.click();
    await testdriver.wait(1500);

    const nameInput = await testdriver.find(
      "the player name / display name input field",
    );
    await nameInput.click();
    await testdriver.type("SecTester");
    await testdriver.wait(500);

    // Confirm room creation (submit button inside the create form).
    const confirmCreate = await testdriver.find(
      "the button that confirms creating the room (Create / Start / Continue)",
    );
    await confirmCreate.click();

    // Wait for navigation into the room and the WebSocket to connect.
    await testdriver.wait(6000);

    // Sanity: we're actually in a game room (route is /room/:id).
    const inRoom = await testdriver.assert(
      "the game room / battle board is visible, indicating we successfully created and entered a room as the host player",
    );
    expect(inRoom).toBeTruthy();

    // --- Primary guard: the address bar must not contain the secret. -------
    // The player secret is a UUID stored in localStorage under `playerSecret`.
    // After the fix it is transmitted via header / body / first WS message,
    // so it must never be visible in any URL the browser exposes.
    const secretNotInAddressBar = await testdriver.assert(
      "the browser address bar URL does NOT contain any 'secret=' or 'player_secret=' query parameter, and does not contain a long UUID-looking credential — the URL is a clean /room/<id> route",
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

    // Filter the network list for anything named/containing "secret".
    const networkFilter = await testdriver.find(
      "the Filter text input in the DevTools Network toolbar",
    );
    await networkFilter.click();
    await testdriver.type("secret");
    await testdriver.wait(1500);

    const noSecretInNetwork = await testdriver.assert(
      "the DevTools Network request list shows NO requests whose URL contains 'secret' — filtering by 'secret' yields an empty result (no WebSocket or XHR request leaks the player secret in its URL/query string)",
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

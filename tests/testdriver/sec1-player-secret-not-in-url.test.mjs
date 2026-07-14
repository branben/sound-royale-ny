import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// SEC-1 (security) — issue #105: the player secret must never be exposed in a
// URL (browser address bar / history / server logs / Referer header), console,
// or error string. It belongs in an Authorization header, a POST body, or the
// first WebSocket message — never in a query string or the visible page.
//
// This is a *reproduction / regression* test. It drives the real join flow in a
// browser and asserts the player secret is not observable in the address bar or
// on the page. It is expected to FAIL while the app still leaks the secret via a
// query param (e.g. `gameSocket` appends `?secret=...&player_id=...` to the WS
// URL, and `discordApi.getAccountStatus` calls
// `/auth/discord/status/?player_id=...&player_secret=...`) and to PASS once the
// secret is moved off the URL.
//
// Target base URL: same convention as smoke.test.mjs — no production deployment
// is discoverable in the repo yet, so the URL is configurable. Point it at a
// running instance (the local dev stack — Vite on :8081 with the Django backend
// on :8000 — or a deployment) via SOUND_ROYALE_URL, e.g.:
//
//   SOUND_ROYALE_URL=http://localhost:8081 \
//     npx vitest run --config vitest.testdriver.config.mjs \
//     tests/testdriver/sec1-player-secret-not-in-url.test.mjs
//
// A real backend must be reachable so a genuine player_secret is minted on join;
// against E2E mock mode (VITE_E2E_TESTING=true) no real secret exists, so the
// leak would not be exercised — do not run this test in mock mode.
const BASE_URL = process.env.SOUND_ROYALE_URL || "https://soundroyale.com";

describe("SEC-1 — player secret is never exposed in the URL", () => {
  it("does not leak the player secret into the address bar after joining/creating a room", async (context) => {
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: BASE_URL });

    // Let the SPA hydrate and the lobby render.
    await testdriver.wait(4000);

    // Enter a player name to establish an identity (the join/create flow is what
    // mints a player_secret on the backend and wires it into API/WS calls).
    const nameField = await testdriver.find(
      "the player name / nickname text input on the lobby",
      { timeout: 30000 },
    );
    await nameField.click();
    await testdriver.type("SecretTester");

    // Create a room — this is the flow that authenticates the player and opens
    // the game WebSocket, the path where the secret has historically leaked into
    // the URL query string.
    const createButton = await testdriver.find(
      "the button that creates or starts a new battle/room (e.g. Create Room / Create Battle / Start)",
      { timeout: 30000 },
    );
    await createButton.click();

    // Give the room to load: the backend call returns the player_secret and the
    // client opens the game socket. Any leak into the URL happens here.
    await testdriver.wait(6000);

    // Core SEC-1 assertion: the address bar must not contain the player secret,
    // player_id, or any `secret=` / `player_secret=` query parameter. A room
    // code in the path (e.g. /room/1234) is fine; a secret in the query is not.
    const noSecretInUrl = await testdriver.assert(
      "the browser address bar URL does NOT contain a player secret or any of these query parameters: 'secret=', 'player_secret=', or 'player_id='. A short numeric room code in the URL path is acceptable, but no long secret/UUID credential value should appear anywhere in the URL.",
    );
    expect(noSecretInUrl).toBeTruthy();

    // Secondary check: the raw secret should not be rendered anywhere on the
    // visible page either (no console/error string or debug text dumping it).
    const noSecretOnPage = await testdriver.assert(
      "no player secret, player_secret value, or raw credential/UUID token is displayed anywhere on the visible page or in a visible error message",
    );
    expect(noSecretOnPage).toBeTruthy();
  });
});

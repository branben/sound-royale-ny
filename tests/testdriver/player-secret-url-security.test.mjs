import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// SEC-1 / guardrail #105 regression: "Player secret exposed via URL".
//
// The original vulnerability (issue #105): the player_secret — the credential a
// client uses to reconnect and to authorize privileged room actions — was
// placed where it could leak: in a URL query param (so it landed in browser
// history, server access logs, proxy/CDN logs, Referer headers, and Sentry
// breadcrumbs) and/or in the WebSocket connect URL.
//
// The fix (PRs #260 + #261):
//   - Transport: the secret is NEVER put in a URL. REST calls send it in the
//     POST body; the WebSocket sends it as a post-handshake `auth` message, so
//     only the non-secret player_id ever appears in the ws:// URL.
//     See src/services/gameSocket.ts (getWsUrl / sendAuthMessage) and
//     src/services/api.ts (player_secret in request bodies).
//   - At rest: the secret is stored only as a SHA-256 hash and returned to the
//     client exactly once on create/join/rotate. See backend security.py,
//     models.py, and migration 0017.
//
// After creating a room the app navigates to `/room/<4-digit room code>`
// (Lobby.tsx handleCreateRoom -> navigate(`/room/${room_code}`)). The room code
// is a short, non-secret 4-digit value; the player_secret is a long urlsafe
// token that is kept in client state, not the URL.
//
// This computer-use test guards the fix from a black-box, user's perspective:
// after a real create-room flow, the browser address bar shows the room route
// (a short numeric room code) and does NOT contain the long player secret
// token. A regression that re-introduces the secret into the URL (query param,
// path segment, or fragment) would make the assertion below fail.
//
// Configurable base URL, matching the other tests in tests/testdriver/. Point
// at the deployment under test via SOUND_ROYALE_URL, e.g.:
//   SOUND_ROYALE_URL=https://your-deployment.example \
//     npx vitest run --config vitest.testdriver.config.mjs
const BASE_URL = process.env.SOUND_ROYALE_URL || "https://soundroyale.com";

describe("SEC-1 (#105) — player secret is never exposed in the URL", () => {
  it("keeps the player secret out of the address bar after creating a room", async (context) => {
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: `${BASE_URL}/` });

    // Let the SPA hydrate and render the lobby.
    await testdriver.wait(4000);

    // 1. Enter a producer name on the lobby landing.
    const nameInput = await testdriver.find(
      "the 'Enter your producer name' text input on the lobby",
    );
    await nameInput.click();
    await testdriver.type("SecretGuard");

    // 2. Switch to create-room mode.
    const createButton = await testdriver.find(
      "the 'Create' button that opens the create-a-room form",
    );
    await createButton.click();
    await testdriver.wait(1500);

    // 3. Name the room.
    const roomNameInput = await testdriver.find(
      "the room name text input (placeholder like 'e.g. Friday Night Beats')",
    );
    await roomNameInput.click();
    await testdriver.type("Secret URL Guard Room");

    // 4. Submit — this creates the room and navigates to /room/<code>.
    const submitButton = await testdriver.find(
      "the 'Create Room' submit button",
    );
    await submitButton.click();

    // Allow the create request + client-side navigation to /room/<code>.
    await testdriver.wait(6000);

    // We should now be on the room screen.
    const onRoom = await testdriver.assert(
      "the app has navigated into a game room (a lobby/waiting room view for the room just created is shown, e.g. a room code, player list, or waiting-for-players UI), not the initial landing page",
    );
    expect(onRoom).toBeTruthy();

    // Core SEC-1 (#105) assertion: inspect the browser address bar. The URL
    // must be the /room/<code> route with only a short numeric room code, and
    // must NOT contain a long secret token, a `player_secret`/`secret` query
    // parameter, or any long random-looking credential string.
    const secretNotInUrl = await testdriver.assert(
      "the browser address bar URL is a '/room/<code>' route where <code> is a short numeric room code (about 4 digits), and the URL does NOT contain a 'player_secret' or 'secret' query parameter, does NOT contain a long random token or hash string, and does NOT expose any player credential anywhere in the path, query string, or fragment",
    );
    expect(secretNotInUrl).toBeTruthy();
  });
});

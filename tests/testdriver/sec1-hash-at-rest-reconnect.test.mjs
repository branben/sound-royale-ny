import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 (security) — issue #105, PR #261 (hash player_secret at rest)
//
// SEC-1 has two halves:
//   (transport) the secret must never travel in a URL / console string, and
//   (at rest)   the secret must be stored HASHED, never as recoverable
//               plaintext (this PR: models.py hashes on save, all auth sites
//               hash the presented value before lookup, plus a rotation
//               endpoint).
//
// The existing computer-use gates (sec1-secret-not-in-url.test.mjs,
// sec1-player-secret-not-in-url.test.mjs) already cover the TRANSPORT half.
// What PR #261 changes is the STORAGE + AUTH path, and the real end-to-end
// risk it introduces is a regression in the credentialed reconnection flow:
//
//   * player_secret went from a UUIDField holding plaintext to a CharField
//     holding a SHA-256 hex digest;
//   * every lookup/compare (auth.py, views.py, game_session_views.py) now
//     hashes the PRESENTED secret before querying;
//   * game_session_views.py previously *required* the secret to be a UUID —
//     new urlsafe-token secrets would have 404'd in production.
//
// If any of those hash-before-compare sites is wrong, the plaintext secret the
// client holds no longer authenticates, and reconnecting to a room breaks. A
// pure backend unit test (test_player_secret_security.py) proves the stored
// value is a hash; THIS test proves the change did not break the user-visible
// flow that depends on it: create a room (issues a plaintext secret, stored
// hashed), then reload — the app must re-authenticate with the stored plaintext
// secret (hashed server-side before compare) and land back in the SAME room.
// It also re-asserts the transport invariant through that flow: the secret is
// never exposed in the address bar.
//
// Convention (matches smoke.test.mjs / the sibling SEC-1 tests): the deployment
// under test is configured via the SOUND_ROYALE_URL env var (wired in CI as the
// `vars.SOUND_ROYALE_URL` Actions repo variable). There is intentionally NO
// hard-coded fallback — the intended domain does not yet resolve, so silently
// defaulting to it would fail CI against a dead host. When SOUND_ROYALE_URL is
// unset (e.g. local dev without a running stack) this live test SKIPS rather
// than producing a misleading red. Run against a reachable stack with:
//
//   SOUND_ROYALE_URL=http://localhost:8080 \
//     npx vitest run --config vitest.testdriver.config.mjs \
//       tests/testdriver/sec1-hash-at-rest-reconnect.test.mjs
//
// Lobby flow selectors verified against src/components/lobby/*:
//   - PlayerNameInput  → placeholder "Enter your producer name"
//   - LobbyLanding     → "Create" (data-testid create-room-button)
//   - CreateRoomForm   → "Room Name" input (placeholder "e.g. Friday Night
//                         Beats"), "Create Room" submit (create-room-submit-button)
// ---------------------------------------------------------------------------

const BASE_URL = process.env.SOUND_ROYALE_URL;
const liveIt = BASE_URL && BASE_URL.trim() ? it : it.skip;

describe("SEC-1: player_secret hashed at rest — reconnection still works (#105, PR #261)", () => {
  liveIt(
    "creating a room then reloading re-authenticates with the (hashed-at-rest) secret and keeps it out of the URL",
    async (context) => {
      const testdriver = TestDriver(context);
      await testdriver.provision.chrome({ url: BASE_URL });

      // Let the SPA hydrate; dismiss the How to Play modal if it is showing
      // (matches the smoke/onboarding behaviour) so the lobby is interactable.
      await testdriver.wait(4000);
      const dismiss = await testdriver.find(
        "the Close button that dismisses the How to Play instructions modal",
      );
      if (dismiss.found()) {
        await dismiss.click();
        await testdriver.wait(1000);
      }

      // --- Step 1: enter the player name (always visible on the lobby). ------
      const nameInput = await testdriver.find(
        "the 'Your Name' text input on the lobby (placeholder 'Enter your producer name')",
      );
      await nameInput.click();
      await testdriver.type("HashTester");
      await testdriver.wait(500);

      // --- Step 2: switch into create-room mode. -----------------------------
      const createModeButton = await testdriver.find(
        "the 'Create' button on the lobby landing that opens the create-room form",
      );
      await createModeButton.click();
      await testdriver.wait(1500);

      // --- Step 3: enter the room name. --------------------------------------
      const roomNameInput = await testdriver.find(
        "the 'Room Name' text input (placeholder 'e.g. Friday Night Beats')",
      );
      await roomNameInput.click();
      await testdriver.type("HashRoom");
      await testdriver.wait(500);

      // --- Step 4: submit to create the room and enter it as the host. -------
      // Creation issues a fresh PLAINTEXT secret to the client (stored HASHED
      // server-side by the model save() hook) and opens the credentialed game
      // WebSocket — the code path this PR reworked.
      const submitCreate = await testdriver.find(
        "the 'Create Room' submit button at the bottom of the create-room form",
      );
      await submitCreate.click();
      await testdriver.wait(6000);

      // Sanity: we actually created and entered a room (route /room/<code>).
      const inRoom = await testdriver.assert(
        "the game room / battle board is visible, indicating we successfully created and entered a room as the host player",
      );
      expect(inRoom).toBeTruthy();

      // --- Step 5: reload — this is the reconnection path. -------------------
      // The client re-sends the stored PLAINTEXT player_secret; the server
      // hashes it before comparing against the stored SHA-256 digest. If the
      // hash-before-compare change (auth.py / views.py / game_session_views.py)
      // regressed, the credential no longer matches and the app falls back to
      // the lobby / shows an auth error instead of re-entering the room.
      await testdriver.pressKeys(["ctrl", "r"]);
      await testdriver.wait(7000);

      const rejoined = await testdriver.assert(
        "after the reload, the SAME game room / battle board is shown again for the host player (we were NOT bounced back to the lobby landing, a login prompt, or an 'invalid player credentials' / authentication error) — proving the stored (hashed-at-rest) secret still authenticates the reconnection",
      );
      expect(rejoined).toBeTruthy();

      // --- Step 6: re-assert the transport invariant through this flow. ------
      // Even after reconnecting, the bearer secret must never surface in the
      // address bar (SEC-1 transport half), only a clean /room/<code> route.
      const urlIsClean = await testdriver.assert(
        "the browser address bar / URL does NOT contain a 'secret=' or 'player_secret=' query parameter and does not contain a long UUID- or token-looking credential — it is a clean /room/<code> route",
      );
      expect(urlIsClean).toBeTruthy();
    },
  );
});

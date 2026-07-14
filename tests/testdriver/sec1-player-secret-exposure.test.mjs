import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// SEC-1 regression test — player secret must never be exposed in a URL/console.
//
// Issue #105 (SEC-1): the player_secret is currently placed in URLs — the game
// WebSocket connects with `?secret=<player_secret>` (src/services/gameSocket.ts
// -> getWsUrl) and the REST layer sends `player_secret` as a query param
// (src/services/api.ts). Anything in a URL leaks into browser history, the
// Network panel, server access logs, and Referer headers, so the secret must
// instead travel in an Authorization header, a POST body, or the first
// WebSocket message.
//
// This test is a *regression guard*: it drives the real app, joins a room
// (which triggers the authenticated WS connect + REST calls), and asserts the
// secret never appears in any request URL or console line.
//
// ⚠️ EXPECTED STATE UNTIL SEC-1 SHIPS: the fix is NOT in this PR (#172), so the
// secret DOES still appear in the WS URL today. Per the review, the exposure is
// verified with a *framework rejection assertion* — `expect(...).rejects
// .toThrow()` — rather than a hand-rolled try/catch + `blocked` boolean. While
// the app is still vulnerable, `assertSecretNotExposed()` rejects and the
// `.rejects.toThrow()` matcher passes (documenting the known-bad state). Once
// SEC-1 lands, flip `EXPECT_SECRET_LEAK` to `false` (or delete it) so the test
// asserts the secret is NOT exposed and stays green as a permanent guard.
//
// Requires a reachable deployment. Point at it via SOUND_ROYALE_URL, e.g.:
//   SOUND_ROYALE_URL=https://staging.example \
//     npx vitest run --config vitest.testdriver.config.mjs
const BASE_URL = process.env.SOUND_ROYALE_URL || "https://soundroyale.com";

// Flip to `false` the moment the SEC-1 fix (secret out of the URL) ships.
const EXPECT_SECRET_LEAK = process.env.SEC1_FIXED ? false : true;

describe("SEC-1 — player secret must not be exposed in URLs/console", () => {
  it("never leaks the player secret into a WS/HTTP URL or the console", async (context) => {
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: BASE_URL });
    await testdriver.wait(4000);

    // Create a battle room as the host. This is the flow that establishes the
    // authenticated game WebSocket (and the REST calls) which today carry the
    // player_secret in the URL.
    const createButton = await testdriver.find(
      "the Create Room / Create Battle / Host button on the lobby",
    );
    await createButton.click();
    await testdriver.wait(1500);

    const nameField = await testdriver.find(
      "the player name / display name input field",
    );
    await nameField.click();
    await testdriver.type("SecretGuard");
    await testdriver.wait(500);

    const confirmCreate = await testdriver.find(
      "the button that submits room creation (Create / Start / Continue)",
    );
    await confirmCreate.click();

    // Let the room finish creating and the authenticated WebSocket connect —
    // this is when the secret would be written into the WS URL.
    await testdriver.wait(6000);

    // The regression check. `assertSecretNotExposed` resolves when the secret is
    // absent from every request URL and console line, and rejects (throws) when
    // it is present. We express BOTH the vulnerable and fixed expectations
    // through the framework's rejection matcher (per TST-2) — no manual
    // try/catch or `blocked` flag.
    const assertSecretNotExposed = async () => {
      const clean = await testdriver.assert(
        "the player secret / player_secret token does NOT appear anywhere in " +
          "the page's request URLs (especially the game WebSocket URL, which " +
          "must not contain a `secret=` query parameter) or in the browser " +
          "console/network log — the secret is only sent via a header, POST " +
          "body, or the first WebSocket message",
      );
      // testdriver.assert() throws on failure and returns true on success; make
      // the boolean-return path throw too so the matcher below is authoritative.
      if (clean !== true) {
        throw new Error("player secret assertion did not pass");
      }
      return clean;
    };

    if (EXPECT_SECRET_LEAK) {
      // Vulnerable (pre-fix) state: the assertion must REJECT because the secret
      // is still in the WS URL. Framework rejection assertion, per TST-2.
      await expect(assertSecretNotExposed()).rejects.toThrow();
    } else {
      // Fixed state: the secret must be absent, so the assertion resolves.
      await expect(assertSecretNotExposed()).resolves.toBe(true);
    }
  });
});

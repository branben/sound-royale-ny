import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// SEC-1 regression: "Admin PIN Exposed in Client Bundle"
// (docs/audits/frontend-audit-2026-06-17.md — CRITICAL SEC-1).
//
// The original vulnerability: the admin gate on /admin/themes and /admin/players
// compared the entered PIN against a build-time `VITE_THEME_ADMIN_PIN` embedded
// in the JavaScript bundle, so anyone could extract it from the deployed assets
// and unlock the admin editor client-side.
//
// The fix moved authentication server-side: the gate now POSTs the PIN to
// `/admin/verify/` and only unlocks when the server responds `{ valid: true }`.
// See src/pages/ThemeAdmin.tsx / src/pages/PlayerAdmin.tsx (`unlock()` calling
// roomApi.verifyAdminPin) and src/services/api.ts (`verifyAdminPin`).
//
// These computer-use tests guard that fix from a black-box, user's perspective:
//   1. Visiting an admin route shows a LOCKED gate — the admin editor content is
//      NOT exposed to an unauthenticated visitor.
//   2. Entering an obviously-wrong PIN does NOT unlock the editor — access is
//      enforced by the server's verification response, not a bundled secret.
//
// A regression that re-introduces a client-side/bundled PIN check (or leaves the
// editor ungated) would make one of these assertions fail.
//
// Base URL convention — matches tests/testdriver/smoke.test.mjs: there is
// intentionally NO hard-coded `https://soundroyale.com` fallback. That domain
// does not yet resolve, and silently defaulting to it makes these computer-use
// tests provision a sandbox and drive a browser against a DEAD host — burning
// TestDriver sandbox minutes and failing with a confusing, hard-to-diagnose
// error instead of a clear "no target wired" signal. Instead these live tests
// read SOUND_ROYALE_URL (wired in CI as the `vars.SOUND_ROYALE_URL` Actions repo
// variable) and SKIP when it is absent, so they only spin up a sandbox once a
// reachable deployment is actually pointed at them, e.g.:
//   SOUND_ROYALE_URL=https://your-deployment.example \
//     npx vitest run --config vitest.testdriver.config.mjs
const BASE_URL = process.env.SOUND_ROYALE_URL;

// Only run the browser-driving tests when a reachable deployment is wired.
// Without one they would provision a sandbox against a non-resolving default
// and fail vacuously; skipping keeps the regression spec preserved (it runs the
// moment SOUND_ROYALE_URL is set) without wasting sandbox minutes locally / in
// CI when no environment is available.
const liveIt = BASE_URL && BASE_URL.trim() ? it : it.skip;

// An arbitrary wrong PIN. If auth were still client-side against a bundled
// secret this could theoretically match; because it is server-verified, a
// random value is rejected.
const WRONG_PIN = "000000-not-the-real-pin";

describe("SEC-1 — admin access is gated server-side, not by a bundled PIN", () => {
  liveIt("shows a locked admin gate on /admin/themes (editor not exposed)", async (context) => {
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: `${BASE_URL}/admin/themes` });
    // Give the SPA time to hydrate and render the gate.
    await testdriver.wait(4000);

    const locked = await testdriver.assert(
      "an 'Admin Access' gate is shown asking for an admin PIN (a password field and an 'Unlock Editor' button), and the theme-rotation editor cards (Classic / Weekly / Monthly rotation inputs with Save buttons) are NOT visible",
    );
    expect(locked).toBeTruthy();
  });

  liveIt("rejects an incorrect PIN and keeps the theme editor locked", async (context) => {
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: `${BASE_URL}/admin/themes` });
    await testdriver.wait(4000);

    const pinField = await testdriver.find("the Admin PIN password input field");
    await pinField.click();
    await testdriver.type(WRONG_PIN, { secret: true });

    const unlockButton = await testdriver.find("the 'Unlock Editor' button");
    await unlockButton.click();

    // Allow the server verification round-trip + error toast to render.
    await testdriver.wait(3000);

    const stillLocked = await testdriver.assert(
      "the admin editor did NOT unlock: the theme-rotation editor cards are still not visible, and the page still shows the locked 'Admin Access' PIN gate (an invalid-PIN error may also be shown)",
    );
    expect(stillLocked).toBeTruthy();
  });

  liveIt("shows a locked admin gate on /admin/players (editor not exposed)", async (context) => {
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: `${BASE_URL}/admin/players` });
    await testdriver.wait(4000);

    const locked = await testdriver.assert(
      "an 'Admin Access' gate is shown asking for an admin PIN (a password field and an 'Unlock Editor' button), and the player-management list / check-in controls are NOT visible",
    );
    expect(locked).toBeTruthy();
  });
});

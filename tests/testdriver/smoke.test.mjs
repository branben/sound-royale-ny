import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// Base URL of the Sound Royale deployment under test.
//
// The issue (#114/#136) asks these tests to target the real deployed
// environment. There is intentionally NO hard-coded fallback: the intended
// domain (https://soundroyale.com, declared in index.html og:url) does not yet
// resolve, and silently defaulting to it makes CI fail against a dead host with
// a confusing, hard-to-diagnose error.
//
// Instead these smoke tests read the target from the SOUND_ROYALE_URL env var
// (wired in CI as the `vars.SOUND_ROYALE_URL` Actions repo variable) and FAIL
// FAST with an actionable message when it is missing. Point them at the real
// environment, e.g.:
//
//   SOUND_ROYALE_URL=https://your-deployment.example \
//     npx vitest run --config vitest.testdriver.config.mjs
//
// Auth: players join by entering a name — there is no credential-based login,
// so no fixtures/credentials are required for these public-route smoke tests.
const BASE_URL = process.env.SOUND_ROYALE_URL;

function requireBaseUrl() {
  if (!BASE_URL || !BASE_URL.trim()) {
    throw new Error(
      "SOUND_ROYALE_URL is not set. The TestDriver smoke suite no longer " +
        "falls back to the not-yet-resolving https://soundroyale.com default. " +
        "Set the SOUND_ROYALE_URL repo variable (Settings -> Secrets and " +
        "variables -> Actions -> Variables) to a reachable deployment, or " +
        "export SOUND_ROYALE_URL=<url> when running locally.",
    );
  }
  return BASE_URL;
}

describe("Sound Royale — public smoke tests", () => {
  it("loads the lobby / landing page", async (context) => {
    const baseUrl = requireBaseUrl();
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: baseUrl });
    // Give the SPA time to hydrate and the lobby to render.
    await testdriver.wait(4000);

    // The landing page shows a "How to Play" modal on load that obscures the
    // lobby. Dismiss it so the lobby (with its create/join entry points) is
    // reachable for the assertion below.
    const dismiss = await testdriver.find(
      "the Close button that dismisses the How to Play instructions modal",
    );
    await dismiss.click();
    await testdriver.wait(1000);

    const loaded = await testdriver.assert(
      "the Sound Royale lobby is visible with the game title/branding and a way to create or join a battle room",
    );
    expect(loaded).toBeTruthy();
  });

  it("shows the How to Play / onboarding dialog", async (context) => {
    const baseUrl = requireBaseUrl();
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: baseUrl });
    await testdriver.wait(4000);

    // The app surfaces the How to Play / onboarding dialog on initial load,
    // so verify it is visible rather than requiring a click-to-open interaction.
    const modalVisible = await testdriver.assert(
      "a How to Play / onboarding dialog explaining the game rules is visible",
    );
    expect(modalVisible).toBeTruthy();
  });

  it("shows the leaderboard page", async (context) => {
    const baseUrl = requireBaseUrl();
    const testdriver = TestDriver(context);
    await testdriver.provision.chrome({ url: `${baseUrl}/leaderboard` });
    await testdriver.wait(4000);

    const leaderboardVisible = await testdriver.assert(
      "a leaderboard / rankings page is visible (a heading like Leaderboard and a list or table of players, or an empty-state message)",
    );
    expect(leaderboardVisible).toBeTruthy();
  });
});

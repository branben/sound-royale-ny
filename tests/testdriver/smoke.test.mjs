import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// Base URL of the Sound Royale deployment under test.
//
// The issue asked to target the production environment, but at the time these
// tests were written no production URL was discoverable in the repo (GitHub
// homepage is unset, the intended domain does not yet resolve, and the infra
// audit under docs/ confirms there is no deployment pipeline / DNS yet).
//
// These smoke tests are therefore written against a *configurable* base URL so
// they run unchanged the moment a deployment exists. Point them at the real
// environment via the SOUND_ROYALE_URL env var, e.g.:
//
//   SOUND_ROYALE_URL=https://your-deployment.example npx vitest run \
//     --config vitest.testdriver.config.mjs
//
// The default below is the intended production domain declared in index.html
// (og:url = https://soundroyale.com).
const BASE_URL = process.env.SOUND_ROYALE_URL || "https://soundroyale.com";

describe("Sound Royale — public smoke tests", () => {
  it("loads the lobby / landing page", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: BASE_URL });
    // Give the SPA time to hydrate.
    await testdriver.wait(4000);

    const loaded = await testdriver.assert(
      "the Sound Royale lobby is visible with the game title/branding and a way to create or join a battle room",
    );
    expect(loaded).toBeTruthy();
  });

  it("can open the How to Play / onboarding info", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: BASE_URL });
    await testdriver.wait(4000);

    const howToPlay = await testdriver.find("the How to Play button");
    await howToPlay.click();
    await testdriver.wait(1500);

    const modalVisible = await testdriver.assert(
      "a How to Play / onboarding dialog explaining the game rules is visible",
    );
    expect(modalVisible).toBeTruthy();
  });

  it("shows the leaderboard page", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: `${BASE_URL}/leaderboard` });
    await testdriver.wait(4000);

    const leaderboardVisible = await testdriver.assert(
      "a leaderboard / rankings page is visible (a heading like Leaderboard and a list or table of players, or an empty-state message)",
    );
    expect(leaderboardVisible).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// Upload guardrails (issue #104 / PR #301)
// -----------------------------------------------------------------------------
// PR #301 added the five upload guardrails enforced by <UploadDrawer/>
// (src/components/game/UploadDrawer.tsx):
//
//   1. Real upload via XHR with 0-100% progress
//   2. Cancel (AbortController)
//   3. Retry after a failed upload
//   4. Client-side 10MB size cap
//   5. MP3 / WAV / OGG only (extension + MIME allowlist)
//
// This computer-use test exercises the two client-side *rejection* guardrails
// (#4 size cap and #5 type allowlist), because they are fully deterministic
// from the UI alone: an invalid file never leaves the browser, so no backend,
// game room, or WebSocket is required. `isAllowedFile()` surfaces the rejection
// as a destructive toast ("Only MP3, WAV, or OGG audio files are allowed" /
// "File is too large. Maximum size is 10MB") and the "Upload Track" button
// stays disabled because no file is selected.
//
// Target URL
// ----------
// The <UploadDrawer/> is reached through the producer board. The `/producer`
// route only renders when the app was built with VITE_E2E_TESTING=true
// (see src/pages/Producer.tsx), so a stock production deployment does NOT expose
// it. Point this suite at a deployment / preview that was built with the E2E
// flag by exporting SOUND_ROYALE_E2E_URL (falls back to the shared
// SOUND_ROYALE_URL used by the other TestDriver smoke tests):
//
//   SOUND_ROYALE_E2E_URL=https://your-e2e-preview.example \
//     npx vitest run --config vitest.testdriver.config.mjs \
//       tests/testdriver/upload-guardrails.test.mjs
//
// There is intentionally no hard-coded fallback host: silently defaulting to a
// dead domain makes CI fail with a confusing error (see smoke.test.mjs for the
// same rationale).
const BASE_URL = process.env.SOUND_ROYALE_E2E_URL || process.env.SOUND_ROYALE_URL;

function requireBaseUrl() {
  if (!BASE_URL || !BASE_URL.trim()) {
    throw new Error(
      "SOUND_ROYALE_E2E_URL (or SOUND_ROYALE_URL) is not set. The upload-" +
        "guardrail suite needs a Sound Royale deployment BUILT WITH " +
        "VITE_E2E_TESTING=true so the /producer route (and its UploadDrawer) " +
        "renders. Export SOUND_ROYALE_E2E_URL=<url> locally, or set the " +
        "matching Actions repo variable in CI.",
    );
  }
  return BASE_URL.replace(/\/$/, "");
}

// Open the producer board and click the first empty tile to reveal the upload
// drawer. Shared setup for every guardrail case below.
async function openUploadDrawer(testdriver, baseUrl) {
  await testdriver.provision.chrome({ url: `${baseUrl}/producer` });
  // Let the SPA hydrate and the mock game state render the bingo board.
  await testdriver.wait(4000);

  const tile = await testdriver.find(
    "an empty (not-yet-completed) tile on the producer bingo board; it shows a music genre label and prompts you to upload a beat",
    { timeout: 30000 },
  );
  await tile.click();
  await testdriver.wait(1500);

  const drawerVisible = await testdriver.assert(
    "the 'Upload Audio for ...' drawer is open, showing a drop zone that says " +
      "'Drop your audio file here' and the helper text 'MP3, WAV, or OGG · max 10MB'",
  );
  expect(drawerVisible).toBeTruthy();
}

describe("Upload guardrails (#104)", () => {
  it("advertises the MP3/WAV/OGG + 10MB limits in the upload drawer", async (context) => {
    const baseUrl = requireBaseUrl();
    const testdriver = TestDriver(context);
    await openUploadDrawer(testdriver, baseUrl);

    // Guardrail is discoverable to the user before they pick a file.
    const limitsShown = await testdriver.assert(
      "the upload drawer clearly communicates the accepted formats and size " +
        "cap: text reading 'MP3, WAV, or OGG' and 'max 10MB' (or '10MB') is visible",
    );
    expect(limitsShown).toBeTruthy();

    // With no file chosen, the primary upload action must be unavailable.
    const uploadDisabled = await testdriver.assert(
      "the 'Upload Track' button is present but disabled/greyed-out because no " +
        "file has been selected yet",
    );
    expect(uploadDisabled).toBeTruthy();
  });

  it("rejects a disallowed file type (not MP3/WAV/OGG)", async (context) => {
    const baseUrl = requireBaseUrl();
    const testdriver = TestDriver(context);
    await openUploadDrawer(testdriver, baseUrl);

    // Create a wrong-type file inside the sandbox and select it through the
    // hidden <input type="file" accept=".mp3,.wav,.ogg">. TestDriver's OS-level
    // file chooser is used because the input is visually hidden.
    await testdriver.exec(
      "sh",
      "printf 'not audio' > /tmp/not-audio.txt",
      5000,
    );

    const dropZone = await testdriver.find(
      "the dashed upload drop zone that says 'Drop your audio file here / or click to browse'",
    );
    await dropZone.click();
    await testdriver.wait(1500);

    // A file chooser dialog should be open; pick the disallowed .txt file.
    await testdriver.ai(
      "In the open file picker dialog, type the path /tmp/not-audio.txt into " +
        "the filename field and confirm/open it to select that file.",
    );
    await testdriver.wait(1500);

    // The client rejects it: destructive toast + no file selected.
    const rejected = await testdriver.assert(
      "a destructive/error toast is shown telling the user that only MP3, WAV, " +
        "or OGG audio files are allowed, and no file appears selected in the drawer",
    );
    expect(rejected).toBeTruthy();

    const stillDisabled = await testdriver.assert(
      "the 'Upload Track' button is still disabled because the invalid file was " +
        "rejected and no valid file is selected",
    );
    expect(stillDisabled).toBeTruthy();
  });

  it("rejects an oversized file (over the 10MB cap)", async (context) => {
    const baseUrl = requireBaseUrl();
    const testdriver = TestDriver(context);
    await openUploadDrawer(testdriver, baseUrl);

    // Build an 11MB file with an allowed .mp3 extension + audio/mpeg-ish name so
    // that the ONLY thing that trips the guardrail is the size (> 10MB).
    await testdriver.exec(
      "sh",
      "head -c 11534336 /dev/zero > /tmp/too-big.mp3",
      10000,
    );

    const dropZone = await testdriver.find(
      "the dashed upload drop zone that says 'Drop your audio file here / or click to browse'",
    );
    await dropZone.click();
    await testdriver.wait(1500);

    await testdriver.ai(
      "In the open file picker dialog, type the path /tmp/too-big.mp3 into the " +
        "filename field and confirm/open it to select that file.",
    );
    await testdriver.wait(1500);

    // Client rejects on size: destructive toast mentioning the 10MB maximum.
    const rejected = await testdriver.assert(
      "a destructive/error toast is shown telling the user the file is too large " +
        "and the maximum size is 10MB, and no file appears selected in the drawer",
    );
    expect(rejected).toBeTruthy();

    const stillDisabled = await testdriver.assert(
      "the 'Upload Track' button is still disabled because the oversized file was " +
        "rejected and no valid file is selected",
    );
    expect(stillDisabled).toBeTruthy();
  });
});

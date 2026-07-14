import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 — Player secret must not leak into the WebSocket connection URL.
//
// Issue #105: "Player secret is exposed via URL query param or console/error
// string. Move to Authorization header / POST body / first WS message."
//
// The leak lives in the FRONTEND: src/services/gameSocket.ts#getWsUrl() builds
// the WebSocket URL and does `url.searchParams.set('secret', playerSecret)`
// (and `?token=<jwt>`). URLs with credentials in the query string are recorded
// by servers, reverse proxies, and browser history — that is the exposure.
//
// This test drives the REAL production module (imported by the harness under
// tests/testdriver/harness/) in a real browser and asserts the player secret
// does NOT appear in the WebSocket URL.
//
//   ┌─ Behavior today (leak present) ─────────────────────────────────────────┐
//   │ The harness renders "LEAK …" and this test FAILS — intentionally         │
//   │ documenting the vulnerability described in SEC-1 / issue #105.           │
//   └──────────────────────────────────────────────────────────────────────────┘
//   ┌─ After the fix (secret moved out of the URL) ────────────────────────────┐
//   │ The harness renders "SAFE …" and this test PASSES with no changes.       │
//   └──────────────────────────────────────────────────────────────────────────┘
//
// The harness bundles the ACTUAL app module, so this verifies production code —
// not a re-implementation. The bundle is built on demand from source here (its
// dist/ output is git-ignored), so there is no committed build artifact to keep
// in sync.
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const HARNESS_CONFIG = path.join(REPO_ROOT, "vite.harness.config.mjs");
const DIST = path.join(HERE, "harness", "dist");

// Build the standalone harness (imports src/services/gameSocket.ts) if needed,
// then read the emitted static files so we can serve them inside the sandbox
// without a dev server or host network access.
function buildAndReadHarness() {
  if (!existsSync(path.join(DIST, "index.html"))) {
    execFileSync(
      "npx",
      ["vite", "build", "--config", HARNESS_CONFIG],
      { cwd: REPO_ROOT, stdio: "inherit" },
    );
  }
  const indexHtml = readFileSync(path.join(DIST, "index.html"), "utf8");
  const assetsDir = path.join(DIST, "assets");
  const assets = readdirSync(assetsDir).map((name) => ({
    name,
    content: readFileSync(path.join(assetsDir, name), "utf8"),
  }));
  return { indexHtml, assets };
}

describe("SEC-1 — player secret must not leak into the WebSocket URL (issue #105)", () => {
  it("does not put the player secret in the WebSocket connection URL", async (context) => {
    const testdriver = TestDriver(context);

    // Launch a browser in the sandbox.
    await testdriver.provision.chrome({ url: "about:blank" });

    // Push the static harness bundle into the sandbox and serve it on :8321.
    const { indexHtml, assets } = buildAndReadHarness();
    const enc = (s) => Buffer.from(s, "utf8").toString("base64");

    await testdriver.exec("sh", "mkdir -p /tmp/sec1/assets", 15000);
    await testdriver.exec(
      "sh",
      `printf '%s' '${enc(indexHtml)}' | base64 -d > /tmp/sec1/index.html`,
      15000,
    );
    for (const asset of assets) {
      await testdriver.exec(
        "sh",
        `printf '%s' '${enc(asset.content)}' | base64 -d > /tmp/sec1/assets/${asset.name}`,
        15000,
      );
    }

    // Serve the bundle in the background, then load it.
    await testdriver.exec(
      "sh",
      "pkill -f 'http.server 8321' >/dev/null 2>&1; cd /tmp/sec1 && (nohup python3 -m http.server 8321 >/tmp/sec1/serve.log 2>&1 &) ; sleep 2",
      20000,
    );

    await testdriver.provision.chrome({ url: "http://localhost:8321/index.html" });
    // Give the module time to run gameSocket.connect() and render the result.
    await testdriver.wait(3000);

    // The security invariant: the harness must report SAFE, meaning the player
    // secret is absent from the WebSocket URL. Until SEC-1 / #105 is fixed the
    // page reports LEAK and this assertion fails — documenting the exposure.
    const secure = await testdriver.assert(
      "the page shows a green 'SAFE' result stating that no secret was found in the WebSocket URL query string (it must NOT show a red 'LEAK' result)",
    );
    expect(secure).toBeTruthy();
  });
});

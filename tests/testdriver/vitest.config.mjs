import { defineConfig } from "vitest/config";
import TestDriver from "testdriverai/vitest";
import { config } from "dotenv";

// Load TD_API_KEY etc. from the repo root .env
config({ path: new URL("../../.env", import.meta.url).pathname });

export default defineConfig({
  test: {
    // TestDriver tests provision a sandbox, boot the backend, and upload
    // recordings — everything needs generous timeouts.
    testTimeout: 900000,
    hookTimeout: 900000,
    include: ["tests/testdriver/**/*.test.mjs"],
    reporters: ["default", TestDriver()],
    setupFiles: ["testdriverai/vitest/setup"],
  },
});

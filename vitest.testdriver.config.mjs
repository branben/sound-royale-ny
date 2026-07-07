import { defineConfig } from "vitest/config";
import TestDriver from "testdriverai/vitest";
import { config } from "dotenv";

// Load TD_API_KEY / TD_CHANNEL from .env
config();

// Dedicated config for TestDriver computer-use tests. Kept separate from the
// repo's existing `vitest.config.ts` (jsdom unit tests) and Playwright E2E
// suite so the three test stacks don't interfere with each other.
//
// Run with: npx vitest run --config vitest.testdriver.config.mjs
export default defineConfig({
  test: {
    include: ["tests/testdriver/**/*.test.mjs"],
    testTimeout: 900000,
    hookTimeout: 900000,
    reporters: ["default", TestDriver()],
    setupFiles: ["testdriverai/vitest/setup"],
  },
});

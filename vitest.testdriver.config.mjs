import { defineConfig } from "vitest/config";
import TestDriver from "testdriverai/vitest";

// Dedicated config for TestDriver computer-use (AI vision) tests.
//
// Kept separate from:
//   - vitest.config.ts        (jsdom component/unit tests: `npm test`)
//   - playwright.config.ts    (Playwright E2E suite: `npm run test:e2e`)
// so the three test stacks never interfere with each other.
//
// Run with:
//   npx vitest run --config vitest.testdriver.config.mjs
//
// Requires a TestDriver API key. In CI the testdriverai/action mints one via
// GitHub OIDC; locally, set TD_API_KEY (see .env, which is git-ignored).
export default defineConfig({
  test: {
    include: ["tests/testdriver/**/*.test.mjs"],
    testTimeout: 900000,
    hookTimeout: 900000,
    reporters: ["default", TestDriver()],
    setupFiles: ["testdriverai/vitest/setup"],
  },
});

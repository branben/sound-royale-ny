import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import TestDriver from "testdriverai/vitest";

config();

// Dedicated Vitest config for TestDriver computer-use tests.
// Kept separate from the frontend `vitest.config.ts` (jsdom unit tests) so the
// two suites never collide. Run with:
//   npx vitest run --config vitest.testdriver.config.mjs
export default defineConfig({
  test: {
    include: ["tests/testdriver/**/*.test.mjs"],
    testTimeout: 900000,
    hookTimeout: 900000,
    reporters: ["default", TestDriver()],
    setupFiles: ["testdriverai/vitest/setup"],
  },
});

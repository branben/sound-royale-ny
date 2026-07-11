import { defineConfig } from 'vitest/config';
import TestDriver from 'testdriverai/vitest';
import { config } from 'dotenv';

config();

// Dedicated config for TestDriver E2E tests so it doesn't collide with the
// app's own vitest.config.ts (jsdom unit tests) or Playwright specs.
export default defineConfig({
  test: {
    include: ['tests/testdriver/**/*.test.mjs'],
    testTimeout: 900000,
    hookTimeout: 900000,
    reporters: ['default', TestDriver()],
    setupFiles: ['testdriverai/vitest/setup'],
  },
});

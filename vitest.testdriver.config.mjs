import { defineConfig } from 'vitest/config';
import TestDriver from 'testdriverai/vitest';
import { config } from 'dotenv';

config();

// Dedicated config for TestDriver E2E tests so they don't collide with the
// app's jsdom `vitest.config.ts`. Run with:
//   npx vitest run --config vitest.testdriver.config.mjs
export default defineConfig({
  test: {
    include: ['tests/testdriver/**/*.{test,spec}.mjs'],
    testTimeout: 900000,
    hookTimeout: 900000,
    reporters: ['default', TestDriver()],
    setupFiles: ['testdriverai/vitest/setup'],
  },
});

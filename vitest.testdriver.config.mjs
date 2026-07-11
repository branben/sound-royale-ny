import { defineConfig } from 'vitest/config';
import TestDriver from 'testdriverai/vitest';
import { config } from 'dotenv';

config();

// Dedicated config for TestDriver computer-use tests so they never collide
// with the frontend unit-test suite (vitest.config.ts, which globs src/**).
export default defineConfig({
  test: {
    include: ['tests/testdriver/**/*.test.mjs'],
    testTimeout: 900000,
    hookTimeout: 900000,
    reporters: ['default', TestDriver()],
    setupFiles: ['testdriverai/vitest/setup'],
  },
});

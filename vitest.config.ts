import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Force NODE_ENV=test for the test process. Without this, an ambient
  // NODE_ENV=production (common in some shells/CI) makes React resolve
  // jsx-dev-runtime.production.min.js, which exports `jsxDEV = void 0`.
  // @vitejs/plugin-react-swc emits jsxDEV(...) calls, so every .test.tsx
  // would throw "jsxDEV is not a function". `test.env` sets the runtime
  // env; `define` bakes it into process.env at transform time.
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
  },
  test: {
    environment: 'jsdom',
    env: {
      NODE_ENV: 'test',
    },
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

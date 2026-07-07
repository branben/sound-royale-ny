import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Tests must run against the development build of React (which exposes
// `act(...)`). The dep optimizer resolves react/react-dom using NODE_ENV, so
// force the test condition here — independent of any NODE_ENV the shell or CI
// may have leaked in (e.g. NODE_ENV=production).
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'test' : process.env.NODE_ENV;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    server: {
      // Force Vite to transform react/react-dom as source (not pre-bundle the
      // production CJS build) so `act()` works under NODE_ENV=test.
      deps: {
        inline: ['react', 'react-dom'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

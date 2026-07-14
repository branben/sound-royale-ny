import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

const root = path.resolve(process.cwd(), 'tests/testdriver/harness');

// Standalone production build of the SEC-1 harness. Rooted at the harness dir
// so the emitted index sits at dist root with clean ./assets/ paths, making it
// trivial to serve statically inside the TestDriver sandbox.
export default defineConfig({
  root,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  base: './',
  build: {
    outDir: path.resolve(process.cwd(), 'tests/testdriver/harness/dist'),
    emptyOutDir: true,
  },
});

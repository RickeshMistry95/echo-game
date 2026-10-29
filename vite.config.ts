import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works from any path (GitHub Pages, itch.io, a folder).
  base: './',
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});

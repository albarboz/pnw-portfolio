import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built site works from any folder or subpath.
  base: './',
  build: {
    // three.js (~520 kB, ~130 kB gzipped) is its own chunk, loaded after first paint by src/effects/fog-layer.ts.
    chunkSizeWarningLimit: 600,
  },
});

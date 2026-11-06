import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: '/habits/',
  build: {
    rollupOptions: {
      // Two entries: the app, and the service worker, which must sit at exactly dist/sw.js.
      input: { main: 'index.html', sw: 'src/sw/sw.ts' },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: { environment: 'jsdom' },
});

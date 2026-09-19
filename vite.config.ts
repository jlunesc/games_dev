import { defineConfig } from 'vitest/config';
import { precachePlugin } from './tools/precache-plugin.ts';

export default defineConfig({
  base: './',
  plugins: [precachePlugin()],
  build: {
    target: 'es2022',
    // Never inline assets as data: URIs; the CSP does not allow them.
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

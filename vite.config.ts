import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './', // Capacitor-ready: relative asset paths
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
  // Only the game's own tests; audit harness copies under docs/ must never run.
  test: { include: ['src/**/*.test.ts'] },
});

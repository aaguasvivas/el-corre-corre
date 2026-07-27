import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Capacitor-ready: relative asset paths
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
});

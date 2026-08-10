import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    open: true,
    // Allow Cursor Cloud / VM proxy hosts (e.g. *.cursorvm.com, *.agent.cvm.dev)
    allowedHosts: true,
  },
  build: {
    target: 'esnext',
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      allow: ['..'],
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});

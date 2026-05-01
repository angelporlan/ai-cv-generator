import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/app-spa/',
  publicDir: false,
  build: {
    outDir: 'public/app-spa',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3002',
      '/auth': 'http://localhost:3002',
      '/cv.pdf': 'http://localhost:3002',
      '/favicon': 'http://localhost:3002',
      '/svg': 'http://localhost:3002'
    }
  }
});

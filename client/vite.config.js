import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var module = { exports: {} };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6111,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});

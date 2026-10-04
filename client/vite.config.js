import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var module = { exports: {} };

const marketingDir = path.resolve(__dirname, 'marketing')

/**
 * Dev-only: serve the static marketing pages (/, /contact, /privacy, …) and the
 * self-hosted GSAP files from the Vite dev server, mirroring the production layout.
 */
function serveMarketing() {
  const vendor = {
    '/vendor/gsap.min.js': path.resolve(__dirname, 'node_modules/gsap/dist/gsap.min.js'),
    '/vendor/ScrollTrigger.min.js': path.resolve(__dirname, 'node_modules/gsap/dist/ScrollTrigger.min.js'),
  }
  return {
    name: 'serve-marketing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '/').split('?')[0]
        if (vendor[url]) {
          res.setHeader('Content-Type', 'text/javascript')
          return res.end(fs.readFileSync(vendor[url]))
        }
        const page = url === '/' ? 'index.html' : url.replace(/^\//, '')
        const candidates = [page, `${page}.html`]
        for (const c of candidates) {
          const file = path.join(marketingDir, c)
          if (file.startsWith(marketingDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
            const ext = path.extname(file)
            const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext]
            if (type) {
              res.setHeader('Content-Type', type)
              return res.end(fs.readFileSync(file))
            }
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveMarketing()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
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

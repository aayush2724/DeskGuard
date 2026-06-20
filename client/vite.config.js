import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const marketingIndex = path.resolve(__dirname, 'marketing/index.html')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-landing',
      configureServer(server) {
        server.middlewares.use('/', (req, res, next) => {
          if (req.url === '/' && fs.existsSync(marketingIndex)) {
            res.setHeader('Content-Type', 'text/html')
            res.end(fs.readFileSync(marketingIndex, 'utf-8'))
            return
          }
          next()
        })
      },
    },
  ],
  server: {
    port: 6111,
    strictPort: true,
    open: 'http://localhost:3001',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

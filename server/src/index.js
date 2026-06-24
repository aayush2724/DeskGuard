import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import pool from './db/postgres.js'
import redis from './db/redis.js'
import deskRouter, { setBroadcast as setDeskBroadcast } from './routes/desks.js'
import libRouter, { setBroadcast as setLibBroadcast } from './routes/librarian.js'
import { startSweepJob, rehydrateTimers, setBroadcast as setSweepBroadcast } from './services/sweepJob.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app  = express()
const PORT = process.env.PORT || 3001

// Helmet: CSP, HSTS, X-Content-Type-Options, etc.
app.use(helmet({
  contentSecurityPolicy: false, // disabled for now due to inline scripts in marketing pages
  crossOriginEmbedderPolicy: false,
}))

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:6111', 'http://localhost:3001', 'https://deskguard.vercel.app']

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    // Allow exact matches or any *.vercel.app preview URL for this project
    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https:\/\/deskguard[\w-]*\.vercel\.app$/.test(origin)
    if (isAllowed) return cb(null, true)
    cb(null, false)
  },
  credentials: true,
}))
app.use(express.json({ limit: '10kb' }))

// Rate limiting (simple in-memory)
function rateLimit({ windowMs = 60000, max = 60 } = {}) {
  const buckets = new Map()
  return (req, res, next) => {
    const key = req.ip
    const now = Date.now()
    let entry = buckets.get(key)
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 }
      buckets.set(key, entry)
    }
    entry.count++
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests' })
    }
    next()
  }
}

// Global rate limit: 100 req/min per IP
app.use(rateLimit({ windowMs: 60000, max: 100 }))

// Strict rate limit for write endpoints: 20 req/min per IP
const writeRateLimit = rateLimit({ windowMs: 60000, max: 20 })

// ── Server-Sent Events ───────────────────────────────────
const sseClients = new Set()

app.get('/api/events', (req, res) => {
  if (sseClients.size > 500) {
    return res.status(429).json({ error: 'Too many SSE connections' })
  }
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const hb = setInterval(() => res.write(': heartbeat\n\n'), 25000)
  sseClients.add(res)

  req.on('close', () => {
    clearInterval(hb)
    sseClients.delete(res)
  })
})

function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`
  sseClients.forEach(c => c.write(data))
}

setDeskBroadcast(broadcast)
setLibBroadcast(broadcast)
setSweepBroadcast(broadcast)

// ── Routes ───────────────────────────────────────────────
// Apply stricter rate limit to write endpoints
app.use('/api/desks', (req, res, next) => {
  if (req.method === 'POST') return writeRateLimit(req, res, next)
  next()
}, deskRouter)
app.use('/api/librarian', (req, res, next) => {
  if (req.method === 'POST') return writeRateLimit(req, res, next)
  next()
}, libRouter)

// Serve React client assets (under client/dist/assets)
app.use('/assets', express.static(path.join(__dirname, '../../client/dist/assets')))

// Serve React app index.html for /live, /librarian and /scan
const VITE_DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:6111'
const distHtml = path.join(__dirname, '../../client/dist/index.html')

if (process.env.NODE_ENV !== 'production' && fs.existsSync(path.join(__dirname, '../../client/src/main.jsx'))) {
  // Dev mode: proxy React routes to Vite dev server for HMR
  const { createProxyMiddleware } = await import('http-proxy-middleware')
  const reactRoutes = ['/live', '/librarian', '/scan']
  reactRoutes.forEach(route => {
    app.use(route, createProxyMiddleware({
      target: VITE_DEV_URL,
      changeOrigin: true,
      ws: true,
    }))
  })
} else {
  // Production: serve built React app
  app.get(['/live', '/librarian', '/scan'], (req, res) => {
    if (fs.existsSync(distHtml)) {
      res.sendFile(distHtml)
    } else {
      res.status(404).json({ error: 'Client not built' })
    }
  })
}

// Serve static marketing site from client/marketing
app.use(express.static(path.join(__dirname, '../../client/marketing')))

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, clients: sseClients.size }))

// 404 for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Express error handler — never leak internals
app.use((err, req, res, _next) => {
  console.error('[server]', err.message)
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' })
  }
  res.status(500).json({ error: 'Internal server error' })
})

// ── Boot ─────────────────────────────────────────────────
async function boot() {
  try {
    await pool.query('SELECT 1')
    console.log('[postgres] Connected')
    await redis.connect()
    await rehydrateTimers()
    startSweepJob()
    app.listen(PORT, () => {
      console.log(`[server] DeskGuard API running on http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('[server] Boot failed:', err)
    process.exit(1)
  }
}

boot()

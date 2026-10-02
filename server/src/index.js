import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import pool from './db/postgres.js'
import redis from './db/redis.js'
import { migrate } from './db/migrate.js'
import deskRouter, { setBroadcast as setDeskBroadcast } from './routes/desks.js'
import libRouter, { setBroadcast as setLibBroadcast } from './routes/librarian.js'
import contactRouter from './routes/contact.js'
import { startSweepJob, rehydrateTimers, setBroadcast as setSweepBroadcast } from './services/sweepJob.js'
import { rateLimit, isStrongKey } from './lib/security.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app  = express()
const PORT = process.env.PORT || 3001
const IS_PROD = process.env.NODE_ENV === 'production'

app.disable('x-powered-by')

// Behind Render/Vercel/any reverse proxy, trust the first hop so req.ip (rate
// limiting) and req.protocol are the real client values. Override with TRUST_PROXY.
app.set('trust proxy', process.env.TRUST_PROXY !== undefined ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : 1)

// ── Security headers ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", 'blob:'],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // the website on another origin reads this API
}))
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()')
  next()
})

// ── CORS ──────────────────────────────────────────────────
// Exact origins from ALLOWED_ORIGINS, plus an optional regex (ALLOWED_ORIGIN_PATTERN)
// for preview deployments. The API uses no cookies, so credentials are not allowed.
const allowedOrigins = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:6111', 'http://localhost:3001', 'https://deskguard-jade.vercel.app']
).map(o => o.trim()).filter(Boolean)
let originPattern = null
if (process.env.ALLOWED_ORIGIN_PATTERN) {
  try { originPattern = new RegExp(process.env.ALLOWED_ORIGIN_PATTERN) } catch { console.error('[cors] invalid ALLOWED_ORIGIN_PATTERN — ignored') }
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // same-origin / curl / server-to-server
    cb(null, allowedOrigins.includes(origin) || (originPattern ? originPattern.test(origin) : false))
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Api-Key', 'Accept'],
  maxAge: 600,
}))
app.use(express.json({ limit: '10kb' }))

// ── Rate limiting ─────────────────────────────────────────
// Many students on one campus Wi-Fi share a single public IP (NAT), so per-IP
// limits must be generous. Tune with RATE_LIMIT_PER_MIN / WRITE_RATE_LIMIT_PER_MIN.
const envInt = (name, def) => { const n = parseInt(process.env[name] || '', 10); return Number.isFinite(n) && n > 0 ? n : def }
app.use('/api', rateLimit({ windowMs: 60_000, max: envInt('RATE_LIMIT_PER_MIN', 600) }))
const writeRateLimit = rateLimit({ windowMs: 60_000, max: envInt('WRITE_RATE_LIMIT_PER_MIN', 120), keyPrefix: 'write:' })
const contactRateLimit = rateLimit({ windowMs: 10 * 60_000, max: 5, keyPrefix: 'contact:', message: 'Too many messages. Please wait a few minutes and try again.' })

// ── Server-Sent Events ───────────────────────────────────
const sseClients = new Set()
const ssePerIp = new Map()
const MAX_SSE_TOTAL = envInt('SSE_MAX_CONNECTIONS', 1000)
const MAX_SSE_PER_IP = envInt('SSE_MAX_PER_IP', 200) // high on purpose: campus NAT

app.get('/api/events', (req, res) => {
  const ip = req.ip || 'unknown'
  if (sseClients.size >= MAX_SSE_TOTAL || (ssePerIp.get(ip) || 0) >= MAX_SSE_PER_IP) {
    return res.status(429).json({ error: 'Too many live connections' })
  }
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  res.write('retry: 5000\n\n')

  ssePerIp.set(ip, (ssePerIp.get(ip) || 0) + 1)
  sseClients.add(res)
  const hb = setInterval(() => res.write(': heartbeat\n\n'), 25000)

  req.on('close', () => {
    clearInterval(hb)
    sseClients.delete(res)
    const n = (ssePerIp.get(ip) || 1) - 1
    if (n <= 0) ssePerIp.delete(ip); else ssePerIp.set(ip, n)
  })
})

function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`
  for (const c of sseClients) {
    try { c.write(data) } catch { sseClients.delete(c) }
  }
}
setDeskBroadcast(broadcast)
setLibBroadcast(broadcast)
setSweepBroadcast(broadcast)

// ── API routes ────────────────────────────────────────────
const onlyWrites = (limiter) => (req, res, next) => (req.method === 'GET' ? next() : limiter(req, res, next))
app.use('/api/desks', onlyWrites(writeRateLimit), deskRouter)
app.use('/api/librarian', onlyWrites(writeRateLimit), libRouter)
app.use('/api/contact', contactRateLimit, contactRouter)

// Health: liveness plus dependency status, without internal details
app.get('/api/health', async (req, res) => {
  const checks = { db: false, redis: false }
  try { await pool.query('SELECT 1'); checks.db = true } catch { /* reported below */ }
  try { checks.redis = (await redis.ping()) === 'PONG' } catch { /* reported below */ }
  const ok = checks.db && checks.redis
  res.setHeader('Cache-Control', 'no-store')
  res.status(ok ? 200 : 503).json({ ok, ...checks })
})

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

// ── Website (optional) ────────────────────────────────────
// When the client has been built (`cd client && npm run build`), serve the full
// site from client/dist so the whole app can run from this single server.
const dist = path.join(__dirname, '../../client/dist')
if (fs.existsSync(path.join(dist, 'app.html'))) {
  app.use(express.static(dist, { extensions: ['html'], index: 'index.html', maxAge: IS_PROD ? '1h' : 0 }))
  app.get(['/live', '/scan', '/librarian'], (req, res) => res.sendFile(path.join(dist, 'app.html')))
  app.use((req, res) => res.status(404).sendFile(path.join(dist, '404.html')))
} else {
  app.get('/', (req, res) => res.type('text').send('DeskGuard API. Run the website with `npm run client:dev` (http://localhost:6111) or build it with `cd client && npm run build`.'))
}

// ── Error handler — never leak internals ─────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' })
  console.error('[server]', req.method, req.path, '-', err.message)
  if (res.headersSent) return
  res.status(500).json({ error: 'Internal server error' })
})

// ── Boot ─────────────────────────────────────────────────
let server
async function boot() {
  try {
    if (!isStrongKey(process.env.LIBRARIAN_API_KEY)) {
      console.warn('[server] LIBRARIAN_API_KEY is missing or weak (needs 16+ chars, not a placeholder) — staff endpoints will return 503')
    }
    await pool.query('SELECT 1')
    console.log('[postgres] Connected')
    await migrate()
    await redis.connect()
    await rehydrateTimers()
    startSweepJob()
    server = app.listen(PORT, () => console.log(`[server] DeskGuard API running on http://localhost:${PORT}`))
  } catch (err) {
    console.error('[server] Boot failed:', err.message)
    process.exit(1)
  }
}

function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`)
  for (const c of sseClients) { try { c.end() } catch { /* ignore */ } }
  const done = () => Promise.allSettled([pool.end(), redis.quit()]).finally(() => process.exit(0))
  if (server) server.close(done); else done()
  setTimeout(() => process.exit(0), 8000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (r) => console.error('[server] Unhandled rejection:', r instanceof Error ? r.message : r))

boot()

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
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

app.use(cors({ origin: '*' }))
app.use(express.json())

// ── Server-Sent Events ───────────────────────────────────
const sseClients = new Set()

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  // Heartbeat every 25s to keep connection alive
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
app.use('/api/desks', deskRouter)
app.use('/api/librarian', libRouter)

// Serve React client assets (under client/dist/assets)
app.use('/assets', express.static(path.join(__dirname, '../../client/dist/assets')))

// Serve React app index.html for /live, /librarian and /scan
app.get(['/live', '/librarian', '/scan', '/live.html', '/librarian.html', '/scan.html'], (req, res) => {
  const distHtml = path.join(__dirname, '../../client/dist/index.html')
  if (fs.existsSync(distHtml)) {
    res.sendFile(distHtml)
  } else {
    // Redirect to Vite dev server if dist doesn't exist (development mode)
    res.redirect(`http://localhost:6111${req.path.replace(/\.html$/, '')}`)
  }
})

// Serve static marketing site from client/marketing
app.use(express.static(path.join(__dirname, '../../client/marketing')))

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, clients: sseClients.size }))

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

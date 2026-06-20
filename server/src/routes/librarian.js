import express from 'express'
import pool from '../db/postgres.js'
import redis from '../db/redis.js'
import QRCode from 'qrcode'

const router = express.Router()
let broadcastFn = null
export const setBroadcast = (fn) => { broadcastFn = fn }
const broadcast = (p) => broadcastFn && broadcastFn(p)

const DESK_ID_RE = /^[A-E]-\d{2}$/
function validId(id) { return typeof id === 'string' && DESK_ID_RE.test(id) }

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

// Auth middleware for write operations (POST)
function requireAuth(req, res, next) {
  const key = req.headers['x-api-key']
  const expected = process.env.LIBRARIAN_API_KEY
  if (!expected) {
    console.error('[librarian] LIBRARIAN_API_KEY not set — rejecting write')
    return res.status(500).json({ error: 'Server misconfigured' })
  }
  if (!key || key !== expected) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

async function log(deskId, type, msg) {
  await pool.query(
    'INSERT INTO activity_log (desk_id, event_type, message) VALUES ($1,$2,$3)',
    [deskId, type, msg]
  )
}

// POST /api/librarian/reset/:id — manually reset one desk to free
router.post('/reset/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!validId(id)) return res.status(400).json({ error: 'Invalid desk ID' })
  try {
    await pool.query(
      "UPDATE desks SET status='free', checkin_at=NULL, away_at=NULL, state_at=NOW() WHERE id=$1",
      [id]
    )
    await redis.del(`checkin:${id}`, `away:${id}`, `grace:${id}`)
    const desk = (await pool.query('SELECT * FROM desks WHERE id=$1', [id])).rows[0]
    if (!desk) return res.status(404).json({ error: 'Desk not found' })
    await log(id, 'reset', `Desk ${id} manually reset by librarian`)
    broadcast({ type: 'desk_update', desk })
    res.json({ ok: true, desk })
  } catch (e) {
    console.error('[librarian] reset error:', e.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/librarian/reset-all — reset all abandoned desks
router.post('/reset-all', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id FROM desks WHERE status='abandoned'")
    for (const { id } of rows) {
      await pool.query(
        "UPDATE desks SET status='free', checkin_at=NULL, away_at=NULL, state_at=NOW() WHERE id=$1",
        [id]
      )
      await redis.del(`checkin:${id}`, `away:${id}`, `grace:${id}`)
      const desk = (await pool.query('SELECT * FROM desks WHERE id=$1', [id])).rows[0]
      broadcast({ type: 'desk_update', desk })
    }
    await log(null, 'reset', `Librarian reset all ${rows.length} abandoned desk(s)`)
    res.json({ ok: true, count: rows.length })
  } catch (e) {
    console.error('[librarian] reset-all error:', e.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/librarian/log — last 100 activity log entries
router.get('/log', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 100'
    )
    res.json(rows)
  } catch (e) {
    console.error('[librarian] log error:', e.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/librarian/stats
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT status, COUNT(*) AS count FROM desks GROUP BY status
    `)
    const stats = { free:0, occupied:0, away:0, abandoned:0, still_here_pending:0 }
    rows.forEach(r => { stats[r.status] = parseInt(r.count) })
    res.json(stats)
  } catch (e) {
    console.error('[librarian] stats error:', e.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/librarian/qr-sheet — print-ready QR code page for all desks
router.get('/qr-sheet', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, zone FROM desks ORDER BY id')
    const origin = `${req.protocol}://${req.get('host')}`

    const cards = await Promise.all(rows.map(async ({ id, zone }) => {
      const url = `${origin}/live?checkin=${encodeURIComponent(id)}`
      const qr  = await QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      return `
        <div class="card">
          <img src="${qr}" alt="QR ${escapeHtml(id)}" />
          <div class="desk-id">${escapeHtml(id)}</div>
          <div class="zone">${escapeHtml(zone)}</div>
        </div>`
    }))

    res.setHeader('Content-Type', 'text/html')
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>DeskGuard — QR Code Sheet</title>
  <style>
    body { font-family: 'Courier New', monospace; background: #fff; margin: 0; padding: 20px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    p  { font-size: 11px; color: #555; margin: 0 0 20px; }
    .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
    .card { border: 1px solid #ccc; border-radius: 8px; padding: 14px; text-align: center; break-inside: avoid; }
    .card img { display: block; margin: 0 auto 8px; width: 140px; height: 140px; }
    .desk-id { font-size: 18px; font-weight: 700; letter-spacing: .05em; }
    .zone { font-size: 9px; color: #777; margin-top: 2px; text-transform: uppercase; letter-spacing: .08em; }
    @media print { body { padding: 0; } h1, p { display: none; } }
  </style>
</head>
<body>
  <h1>DeskGuard — QR Code Sheet</h1>
  <p>Print and stick one code on each desk. Students scan to check in instantly.</p>
  <div class="grid">${cards.join('')}</div>
</body>
</html>`)
  } catch (e) {
    console.error('[librarian] qr-sheet error:', e.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

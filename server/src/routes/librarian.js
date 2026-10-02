import express from 'express'
import pool from '../db/postgres.js'
import redis from '../db/redis.js'
import QRCode from 'qrcode'
import { rateLimit, safeEqual, isStrongKey } from '../lib/security.js'
import { validId, logActivity, DESK_COLUMNS, publicSiteUrl } from '../lib/desks.js'

const router = express.Router()
let broadcastFn = null
export const setBroadcast = (fn) => { broadcastFn = fn }
const broadcast = (p) => broadcastFn && broadcastFn(p)

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

// Slow down key guessing: 20 failed attempts per IP per 15 minutes
const failedAuthLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, message: 'Too many failed sign-in attempts. Try again later.', keyPrefix: 'libauth:' })

/**
 * Librarian auth. The key must be sent in the X-Api-Key header — never in the
 * URL, where it would end up in browser history, proxy logs and Referer headers.
 */
function requireAuth(req, res, next) {
  const expected = process.env.LIBRARIAN_API_KEY
  if (!isStrongKey(expected)) {
    console.error('[librarian] LIBRARIAN_API_KEY is missing or too weak (min 16 chars, not a placeholder) — staff endpoints disabled')
    return res.status(503).json({ error: 'Staff access is not configured on this server.' })
  }
  const key = req.get('x-api-key')
  if (key && safeEqual(key, expected)) return next()
  failedAuthLimiter(req, res, () => res.status(401).json({ error: 'Unauthorized' }))
}

router.use(requireAuth)
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })

async function freeDesk(id) {
  const { rows } = await pool.query(
    `UPDATE desks SET status='free', checkin_at=NULL, away_at=NULL, state_at=NOW() WHERE id=$1 RETURNING ${DESK_COLUMNS}`,
    [id]
  )
  if (rows[0]) await redis.del(`checkin:${id}`, `away:${id}`, `grace:${id}`)
  return rows[0] || null
}

// POST /api/librarian/reset/:id — manually reset one desk to free
router.post('/reset/:id', async (req, res, next) => {
  const { id } = req.params
  if (!validId(id)) return res.status(400).json({ error: 'Invalid desk ID.' })
  try {
    const desk = await freeDesk(id)
    if (!desk) return res.status(404).json({ error: 'Desk not found.' })
    await logActivity(id, 'reset', `Desk ${id} manually reset by librarian`)
    broadcast({ type: 'desk_update', desk })
    res.json({ ok: true, desk })
  } catch (e) { next(e) }
})

// POST /api/librarian/reset-all — reset all abandoned desks
router.post('/reset-all', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE desks SET status='free', checkin_at=NULL, away_at=NULL, state_at=NOW() WHERE status='abandoned' RETURNING ${DESK_COLUMNS}`
    )
    for (const desk of rows) {
      await redis.del(`checkin:${desk.id}`, `away:${desk.id}`, `grace:${desk.id}`)
      broadcast({ type: 'desk_update', desk })
    }
    await logActivity(null, 'reset', `Librarian reset all ${rows.length} abandoned desk(s)`)
    res.json({ ok: true, count: rows.length })
  } catch (e) { next(e) }
})

// GET /api/librarian/log — last 100 activity log entries
router.get('/log', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, desk_id, event_type, message, created_at FROM activity_log ORDER BY created_at DESC LIMIT 100'
    )
    res.json(rows)
  } catch (e) { next(e) }
})

// GET /api/librarian/stats
router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT status, COUNT(*) AS count FROM desks GROUP BY status')
    const stats = { free: 0, occupied: 0, away: 0, abandoned: 0, still_here_pending: 0 }
    rows.forEach(r => { stats[r.status] = parseInt(r.count, 10) })
    res.json(stats)
  } catch (e) { next(e) }
})

// GET /api/librarian/contact-requests — enquiries submitted via the website contact form
router.get('/contact-requests', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, institution, floors, message, created_at FROM contact_requests ORDER BY created_at DESC LIMIT 200'
    )
    res.json(rows)
  } catch (e) { next(e) }
})

// DELETE /api/librarian/contact-requests/:id — honour deletion requests / clean up handled enquiries
router.delete('/contact-requests/:id', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id.' })
  try {
    const { rowCount } = await pool.query('DELETE FROM contact_requests WHERE id=$1', [id])
    if (!rowCount) return res.status(404).json({ error: 'Not found.' })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// GET /api/librarian/qr-sheet — print-ready QR code page for all desks
router.get('/qr-sheet', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, zone FROM desks ORDER BY id')
    const site = publicSiteUrl(req)

    const cards = await Promise.all(rows.map(async ({ id, zone }) => {
      const url = `${site}/live?checkin=${encodeURIComponent(id)}`
      const qr  = await QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      return `
        <div class="card">
          <img src="${qr}" alt="QR code to check in to desk ${escapeHtml(id)}" width="140" height="140" />
          <div class="desk-id">${escapeHtml(id)}</div>
          <div class="zone">${escapeHtml(zone)}</div>
        </div>`
    }))

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="robots" content="noindex"/>
  <title>DeskGuard — QR Code Sheet</title>
  <style>
    body { font-family: 'Courier New', monospace; background: #fff; color: #111; margin: 0; padding: 20px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    p  { font-size: 11px; color: #444; margin: 0 0 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
    .card { border: 1px solid #ccc; border-radius: 8px; padding: 14px; text-align: center; break-inside: avoid; }
    .card img { display: block; margin: 0 auto 8px; width: 140px; height: 140px; }
    .desk-id { font-size: 18px; font-weight: 700; letter-spacing: .05em; }
    .zone { font-size: 9px; color: #555; margin-top: 2px; text-transform: uppercase; letter-spacing: .08em; }
    @media print { body { padding: 0; } h1, p { display: none; } .grid { grid-template-columns: repeat(5, 1fr); } }
  </style>
</head>
<body>
  <h1>DeskGuard — QR Code Sheet</h1>
  <p>Print and stick one code on each desk. Students scan to check in. Codes link to ${escapeHtml(site)}.</p>
  <div class="grid">${cards.join('')}</div>
</body>
</html>`)
  } catch (e) { next(e) }
})

export default router

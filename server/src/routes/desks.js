import express from 'express'
import pool from '../db/postgres.js'
import redis from '../db/redis.js'
import { validId, logActivity, DESK_COLUMNS, publicSiteUrl } from '../lib/desks.js'

const router = express.Router()
let broadcastFn = null
export const setBroadcast = (fn) => { broadcastFn = fn }
const broadcast = (p) => broadcastFn && broadcastFn(p)

const AWAY_TTL    = () => parseInt(process.env.AWAY_TTL_SECONDS    || '1200', 10)
const CHECKIN_TTL = () => parseInt(process.env.CHECKIN_TTL_SECONDS || '7200', 10)

/**
 * Allowed source states for each action. Transitions are applied atomically
 * (UPDATE … WHERE status = ANY(...)), so two people racing for the same desk
 * cannot both "win", and a desk someone is using cannot be checked in over.
 */
const TRANSITIONS = {
  checkin: {
    from: ['free', 'away', 'abandoned'],
    sql: "status='occupied', checkin_at=NOW(), away_at=NULL, state_at=NOW()",
    conflict: (s) => (s === 'occupied' || s === 'still_here_pending')
      ? 'This desk is already occupied.'
      : 'This desk cannot be checked in to right now.',
  },
  away: {
    from: ['occupied', 'still_here_pending'],
    sql: "status='away', away_at=NOW(), state_at=NOW()",
    conflict: (s) => s === 'away' ? 'This desk is already on an Away hold.' : 'Only an occupied desk can be put on Away.',
  },
  checkout: {
    from: ['occupied', 'away', 'still_here_pending'],
    sql: "status='free', checkin_at=NULL, away_at=NULL, state_at=NOW()",
    conflict: (s) => s === 'free' ? 'This desk is already free.' : 'This desk cannot be checked out right now.',
  },
  stillhere: {
    from: ['still_here_pending', 'occupied'],
    sql: "status='occupied', checkin_at=NOW(), away_at=NULL, state_at=NOW()",
    conflict: () => 'There is no active session on this desk to confirm.',
  },
}

async function transition(id, action) {
  const t = TRANSITIONS[action]
  const { rows } = await pool.query(
    `UPDATE desks SET ${t.sql} WHERE id=$1 AND status = ANY($2::desk_status[]) RETURNING ${DESK_COLUMNS}`,
    [id, t.from]
  )
  if (rows[0]) return { desk: rows[0] }
  const cur = await pool.query('SELECT status FROM desks WHERE id=$1', [id])
  if (!cur.rows[0]) return { status: 404, error: 'Desk not found.' }
  return { status: 409, error: t.conflict(cur.rows[0].status) }
}

// GET /api/desks — all desks
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT ${DESK_COLUMNS} FROM desks ORDER BY id`)
    res.setHeader('Cache-Control', 'no-store')
    res.json(result.rows)
  } catch (e) { next(e) }
})

function handler(action, after, logMsg, eventType) {
  return async (req, res, next) => {
    const { id } = req.params
    if (!validId(id)) return res.status(400).json({ error: 'Invalid desk ID.' })
    try {
      const r = await transition(id, action)
      if (r.error) return res.status(r.status).json({ error: r.error })
      await after(id)
      await logActivity(id, eventType, logMsg(id))
      broadcast({ type: 'desk_update', desk: r.desk })
      res.json(r.desk)
    } catch (e) { next(e) }
  }
}

router.post('/:id/checkin', handler('checkin', async (id) => {
  await redis.set(`checkin:${id}`, '1', 'EX', CHECKIN_TTL())
  await redis.del(`away:${id}`, `grace:${id}`)
}, (id) => `Desk ${id} checked in`, 'occupied'))

router.post('/:id/away', handler('away', async (id) => {
  await redis.set(`away:${id}`, '1', 'EX', AWAY_TTL())
  await redis.del(`grace:${id}`)
}, (id) => `Desk ${id} — student went away (${Math.round(AWAY_TTL() / 60)} min hold)`, 'away'))

router.post('/:id/checkout', handler('checkout', async (id) => {
  await redis.del(`checkin:${id}`, `away:${id}`, `grace:${id}`)
}, (id) => `Desk ${id} checked out`, 'free'))

router.post('/:id/stillhere', handler('stillhere', async (id) => {
  await redis.set(`checkin:${id}`, '1', 'EX', CHECKIN_TTL())
  await redis.del(`grace:${id}`)
}, (id) => `Desk ${id} — student confirmed presence`, 'occupied'))

// GET /api/desks/qr/:id — check-in URL for QR generation
router.get('/qr/:id', (req, res) => {
  const { id } = req.params
  if (!validId(id)) return res.status(400).json({ error: 'Invalid desk ID.' })
  res.json({ url: `${publicSiteUrl(req)}/live?checkin=${encodeURIComponent(id)}` })
})

export default router

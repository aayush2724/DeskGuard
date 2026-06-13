import express from 'express'
import pool from '../db/postgres.js'
import redis from '../db/redis.js'
import { setBroadcast as setSweepBroadcast } from '../services/sweepJob.js'

const router = express.Router()
let broadcastFn = null
export const setBroadcast = (fn) => {
  broadcastFn = fn
  setSweepBroadcast(fn)
}
const broadcast = (p) => broadcastFn && broadcastFn(p)

const AWAY_TTL    = () => parseInt(process.env.AWAY_TTL_SECONDS    || '1200', 10)
const CHECKIN_TTL = () => parseInt(process.env.CHECKIN_TTL_SECONDS || '7200', 10)

async function log(deskId, type, msg) {
  await pool.query(
    'INSERT INTO activity_log (desk_id, event_type, message) VALUES ($1,$2,$3)',
    [deskId, type, msg]
  )
}

// GET /api/desks — all desks
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM desks ORDER BY id')
    res.json(result.rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/desks/:id/checkin
router.post('/:id/checkin', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query(
      "UPDATE desks SET status='occupied', checkin_at=NOW(), away_at=NULL, state_at=NOW() WHERE id=$1",
      [id]
    )
    await redis.set(`checkin:${id}`, '1', 'EX', CHECKIN_TTL())
    await redis.del(`away:${id}`, `grace:${id}`)
    const desk = (await pool.query('SELECT * FROM desks WHERE id=$1', [id])).rows[0]
    await log(id, 'occupied', `Desk ${id} checked in`)
    broadcast({ type: 'desk_update', desk })
    res.json(desk)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/desks/:id/away
router.post('/:id/away', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query(
      "UPDATE desks SET status='away', away_at=NOW(), state_at=NOW() WHERE id=$1",
      [id]
    )
    await redis.set(`away:${id}`, '1', 'EX', AWAY_TTL())
    const desk = (await pool.query('SELECT * FROM desks WHERE id=$1', [id])).rows[0]
    await log(id, 'away', `Desk ${id} — student went away (20 min hold)`)
    broadcast({ type: 'desk_update', desk })
    res.json(desk)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/desks/:id/checkout
router.post('/:id/checkout', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query(
      "UPDATE desks SET status='free', checkin_at=NULL, away_at=NULL, state_at=NOW() WHERE id=$1",
      [id]
    )
    await redis.del(`checkin:${id}`, `away:${id}`, `grace:${id}`)
    const desk = (await pool.query('SELECT * FROM desks WHERE id=$1', [id])).rows[0]
    await log(id, 'free', `Desk ${id} checked out`)
    broadcast({ type: 'desk_update', desk })
    res.json(desk)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/desks/:id/stillhere — student confirms presence
router.post('/:id/stillhere', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query(
      "UPDATE desks SET status='occupied', checkin_at=NOW(), state_at=NOW() WHERE id=$1",
      [id]
    )
    await redis.set(`checkin:${id}`, '1', 'EX', CHECKIN_TTL())
    await redis.del(`grace:${id}`)
    const desk = (await pool.query('SELECT * FROM desks WHERE id=$1', [id])).rows[0]
    await log(id, 'occupied', `Desk ${id} — student confirmed presence`)
    broadcast({ type: 'desk_update', desk })
    res.json(desk)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/desks/qr/:id — check-in URL for QR generation
router.get('/qr/:id', async (req, res) => {
  const { id } = req.params
  const origin = `${req.protocol}://${req.get('host')}`
  res.json({ url: `${origin}/live?checkin=${id}` })
})

export default router

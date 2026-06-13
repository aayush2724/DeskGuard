/**
 * sweepJob.js — Server-side background sweep (runs every 60s via node-cron)
 * All desk timers live here. The browser NEVER owns a timer.
 *
 * Logic:
 *  1. 'away' desks whose Redis key `away:{id}` has expired → abandoned
 *  2. 'occupied' desks whose Redis key `checkin:{id}` has expired → still_here_pending + SSE prompt
 *  3. 'still_here_pending' desks whose Redis key `grace:{id}` expired → abandoned
 */
import cron from 'node-cron'
import pool from '../db/postgres.js'
import redis from '../db/redis.js'

let broadcastFn = null
export const setBroadcast = (fn) => { broadcastFn = fn }

const broadcast = (payload) => {
  if (broadcastFn) broadcastFn(payload)
}

async function log(deskId, type, msg) {
  await pool.query(
    'INSERT INTO activity_log (desk_id, event_type, message) VALUES ($1,$2,$3)',
    [deskId, type, msg]
  )
}

async function sweep() {
  console.log('[sweep] Running sweep at', new Date().toISOString())
  try {
    // ── 1. Check away desks ──────────────────────────────
    const awayRes = await pool.query("SELECT id FROM desks WHERE status='away'")
    for (const { id } of awayRes.rows) {
      const exists = await redis.exists(`away:${id}`)
      if (!exists) {
        await pool.query(
          "UPDATE desks SET status='abandoned', state_at=NOW(), away_at=NULL WHERE id=$1",
          [id]
        )
        await log(id, 'abandoned', `Desk ${id} auto-abandoned — 20 min away timer expired`)
        const desk = (await pool.query('SELECT * FROM desks WHERE id=$1', [id])).rows[0]
        broadcast({ type: 'desk_update', desk })
        console.log(`[sweep] ${id} → abandoned (away expired)`)
      }
    }

    // ── 2. Check occupied desks ──────────────────────────
    const occRes = await pool.query("SELECT id FROM desks WHERE status='occupied'")
    for (const { id } of occRes.rows) {
      const exists = await redis.exists(`checkin:${id}`)
      if (!exists) {
        await pool.query(
          "UPDATE desks SET status='still_here_pending', state_at=NOW() WHERE id=$1",
          [id]
        )
        // Give 30-second grace period
        await redis.set(`grace:${id}`, '1', 'EX', 30)
        await log(id, 'still_here', `Desk ${id} — "Still here?" prompt sent`)
        broadcast({ type: 'still_here', deskId: id })
        console.log(`[sweep] ${id} → still_here_pending`)
      }
    }

    // ── 3. Check still_here_pending desks ───────────────
    const pendingRes = await pool.query("SELECT id FROM desks WHERE status='still_here_pending'")
    for (const { id } of pendingRes.rows) {
      const graceExists = await redis.exists(`grace:${id}`)
      if (!graceExists) {
        await pool.query(
          "UPDATE desks SET status='abandoned', state_at=NOW(), checkin_at=NULL WHERE id=$1",
          [id]
        )
        await log(id, 'abandoned', `Desk ${id} auto-abandoned — no response to "Still here?"`)
        const desk = (await pool.query('SELECT * FROM desks WHERE id=$1', [id])).rows[0]
        broadcast({ type: 'desk_update', desk })
        console.log(`[sweep] ${id} → abandoned (no still-here response)`)
      }
    }
  } catch (err) {
    console.error('[sweep] Error:', err.message)
  }
}

export function startSweepJob() {
  // Run immediately on boot, then every 60 seconds
  sweep()
  cron.schedule('* * * * *', sweep)
  console.log('[sweep] Background sweep started (every 60s)')
}

/**
 * Re-hydrate Redis TTLs on server restart from PostgreSQL timestamps.
 * Ensures timers survive a server crash.
 */
export async function rehydrateTimers() {
  const AWAY_TTL    = parseInt(process.env.AWAY_TTL_SECONDS    || '1200', 10)
  const CHECKIN_TTL = parseInt(process.env.CHECKIN_TTL_SECONDS || '7200', 10)

  const res = await pool.query(
    "SELECT id, status, checkin_at, away_at FROM desks WHERE status IN ('occupied','away','still_here_pending')"
  )
  for (const row of res.rows) {
    if (row.status === 'away' && row.away_at) {
      const elapsed = Math.floor((Date.now() - new Date(row.away_at).getTime()) / 1000)
      const remaining = Math.max(AWAY_TTL - elapsed, 1)
      await redis.set(`away:${row.id}`, '1', 'EX', remaining)
    }
    if ((row.status === 'occupied' || row.status === 'still_here_pending') && row.checkin_at) {
      const elapsed = Math.floor((Date.now() - new Date(row.checkin_at).getTime()) / 1000)
      const remaining = Math.max(CHECKIN_TTL - elapsed, 1)
      await redis.set(`checkin:${row.id}`, '1', 'EX', remaining)
    }
  }
  console.log(`[sweep] Re-hydrated Redis TTLs for ${res.rows.length} active desk(s)`)
}

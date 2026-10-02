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
import { logActivity, DESK_COLUMNS } from '../lib/desks.js'

let broadcastFn = null
export const setBroadcast = (fn) => { broadcastFn = fn }

const broadcast = (payload) => {
  if (broadcastFn) broadcastFn(payload)
}

const log = logActivity
let sweeping = false

async function sweep() {
  if (sweeping) return // never overlap runs if one is slow
  sweeping = true
  try {
    // ── 1. Check away desks ──────────────────────────────
    const awayRes = await pool.query("SELECT id FROM desks WHERE status='away'")
    for (const { id } of awayRes.rows) {
      const exists = await redis.exists(`away:${id}`)
      if (!exists) {
        const { rows } = await pool.query(
          `UPDATE desks SET status='abandoned', state_at=NOW(), away_at=NULL WHERE id=$1 AND status='away' RETURNING ${DESK_COLUMNS}`,
          [id]
        )
        if (!rows[0]) continue
        await log(id, 'abandoned', `Desk ${id} auto-abandoned — away timer expired`)
        broadcast({ type: 'desk_update', desk: rows[0] })
      }
    }

    // ── 2. Check occupied desks ──────────────────────────
    const occRes = await pool.query("SELECT id FROM desks WHERE status='occupied'")
    for (const { id } of occRes.rows) {
      const exists = await redis.exists(`checkin:${id}`)
      if (!exists) {
        const { rows } = await pool.query(
          `UPDATE desks SET status='still_here_pending', state_at=NOW() WHERE id=$1 AND status='occupied' RETURNING ${DESK_COLUMNS}`,
          [id]
        )
        if (!rows[0]) continue
        broadcast({ type: 'desk_update', desk: rows[0] })
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
        const { rows } = await pool.query(
          `UPDATE desks SET status='abandoned', state_at=NOW(), checkin_at=NULL WHERE id=$1 AND status='still_here_pending' RETURNING ${DESK_COLUMNS}`,
          [id]
        )
        if (!rows[0]) continue
        await log(id, 'abandoned', `Desk ${id} auto-abandoned — no response to "Still here?"`)
        broadcast({ type: 'desk_update', desk: rows[0] })
        console.log(`[sweep] ${id} → abandoned (no still-here response)`)
      }
    }
  } catch (err) {
    console.error('[sweep] Error:', err.message)
  } finally {
    sweeping = false
  }
}

/** Removes activity-log entries older than ACTIVITY_LOG_RETENTION_DAYS (default 90; 0 disables). */
async function pruneActivityLog() {
  const days = parseInt(process.env.ACTIVITY_LOG_RETENTION_DAYS ?? '90', 10)
  if (!Number.isFinite(days) || days <= 0) return
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM activity_log WHERE created_at < NOW() - make_interval(days => $1)', [days]
    )
    if (rowCount) console.log(`[sweep] pruned ${rowCount} activity-log entries older than ${days} days`)
  } catch (err) {
    console.error('[sweep] prune error:', err.message)
  }
}

export function startSweepJob() {
  // Run immediately on boot, then every 60 seconds
  sweep()
  pruneActivityLog()
  cron.schedule('* * * * *', sweep)
  cron.schedule('17 3 * * *', pruneActivityLog)
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

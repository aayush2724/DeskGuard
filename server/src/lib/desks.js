import pool from '../db/postgres.js'

export const DESK_ID_RE = /^[A-E]-\d{2}$/
export const validId = (id) => typeof id === 'string' && DESK_ID_RE.test(id)

/** Activity logging must never turn a successful desk change into a 500. */
export async function logActivity(deskId, type, msg) {
  try {
    await pool.query(
      'INSERT INTO activity_log (desk_id, event_type, message) VALUES ($1,$2,$3)',
      [deskId, type, msg]
    )
  } catch (e) {
    console.error('[activity_log] insert failed:', e.message)
  }
}

/** Public, non-sensitive desk fields returned to clients. */
export const DESK_COLUMNS = 'id, zone, row_num, col_num, status, checkin_at, away_at, state_at'

/** Base URL used for QR codes / check-in links (the website, not the API host). */
export function publicSiteUrl(req) {
  const configured = (process.env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
  if (configured) return configured
  return `${req.protocol}://${req.get('host')}`
}

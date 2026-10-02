import pool from './postgres.js'

/**
 * Idempotent, additive migrations applied on boot so existing deployments pick
 * up new tables without a manual step. Never removes or rewrites existing data.
 */
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL CHECK (char_length(name) <= 120),
      email       TEXT NOT NULL CHECK (char_length(email) <= 254),
      institution TEXT CHECK (char_length(institution) <= 160),
      floors      TEXT,
      message     TEXT CHECK (char_length(message) <= 2000),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at DESC);
  `)
}

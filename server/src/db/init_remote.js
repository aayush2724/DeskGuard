/**
 * One-time script to initialize the remote Neon DB schema and seed desks.
 * Run with: node src/db/init_remote.js
 */
import 'dotenv/config'
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const ZONE_DEFS = [
  { zone: 'Quiet Study',    prefix: 'A', rows: 4, cols: 5 },
  { zone: 'Collaboration',  prefix: 'B', rows: 3, cols: 5 },
  { zone: 'Reading Lounge', prefix: 'C', rows: 4, cols: 5 },
  { zone: 'Focus Pods',     prefix: 'D', rows: 3, cols: 5 },
  { zone: 'Open Desk',      prefix: 'E', rows: 2, cols: 10 },
]

async function run() {
  console.log('🔌 Connecting to Neon PostgreSQL...')
  await pool.query('SELECT 1')
  console.log('✅ Connected!\n')

  // --- Run Schema ---
  console.log('📐 Running schema...')
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(schema)
  console.log('✅ Schema applied!\n')

  // --- Seed Desks ---
  console.log('🌱 Seeding desks...')
  await pool.query('DELETE FROM desks')

  let count = 0
  for (const { zone, prefix, rows, cols } of ZONE_DEFS) {
    let n = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        n++
        const id = `${prefix}-${String(n).padStart(2, '0')}`
        await pool.query(
          'INSERT INTO desks (id, zone, row_num, col_num) VALUES ($1, $2, $3, $4)',
          [id, zone, r, c]
        )
        count++
      }
    }
  }
  console.log(`✅ Seeded ${count} desks!\n`)
  await pool.end()
  console.log('🎉 Database initialisation complete!')
}

run().catch(err => {
  console.error('❌ Failed:', err.message)
  process.exit(1)
})

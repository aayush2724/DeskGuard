import 'dotenv/config'
import pool from './postgres.js'

const ZONE_DEFS = [
  { zone: 'Quiet Study',    prefix: 'A', rows: 4, cols: 5 },
  { zone: 'Collaboration',  prefix: 'B', rows: 3, cols: 5 },
  { zone: 'Reading Lounge', prefix: 'C', rows: 4, cols: 5 },
  { zone: 'Focus Pods',     prefix: 'D', rows: 3, cols: 5 },
  { zone: 'Open Desk',      prefix: 'E', rows: 2, cols: 10 },
]

async function seed() {
  console.log('Clearing existing desks...')
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

  console.log(`Successfully seeded ${count} desks!`)
  process.exit(0)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})

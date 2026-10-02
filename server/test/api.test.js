/**
 * API integration tests. They run against REAL Postgres + Redis and therefore
 * only execute when TEST_DATABASE_URL and TEST_REDIS_URL are set — point them
 * at disposable instances, because the tests reseed the desks table. Example:
 *
 *   docker run --rm -d --name dg_test_pg -p 127.0.0.1:55432:5432 \
 *     -e POSTGRES_USER=dg -e POSTGRES_PASSWORD=dgtest -e POSTGRES_DB=deskguard_test postgres:16-alpine
 *   docker run --rm -d --name dg_test_redis -p 127.0.0.1:56379:6379 redis:7-alpine
 *   TEST_DATABASE_URL=postgresql://dg:dgtest@127.0.0.1:55432/deskguard_test \
 *   TEST_REDIS_URL=redis://127.0.0.1:56379/15 npm test
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { TEST_DATABASE_URL, TEST_REDIS_URL } = process.env
const skip = !TEST_DATABASE_URL || !TEST_REDIS_URL
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3999
const BASE = `http://127.0.0.1:${PORT}/api`
const KEY = 'test-librarian-key-0123456789'
let proc

const env = {
  ...process.env,
  PORT: String(PORT),
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: TEST_REDIS_URL,
  LIBRARIAN_API_KEY: KEY,
  ALLOWED_ORIGINS: 'https://allowed.example',
  PUBLIC_SITE_URL: 'https://site.example',
  TRUST_PROXY: '0',
}

before(async () => {
  if (skip) return
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL })
  await pool.query(fs.readFileSync(path.join(root, 'src/db/schema.sql'), 'utf8'))
  await pool.query(fs.readFileSync(path.join(root, 'src/db/schema.sql'), 'utf8')) // must be re-runnable
  await pool.query('TRUNCATE contact_requests, activity_log') // disposable test DB only
  await pool.end()
  execFileSync(process.execPath, ['src/db/seed.js'], { cwd: root, env, stdio: 'ignore' })
  proc = spawn(process.execPath, ['src/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  proc.stdout.on('data', d => { out += d })
  proc.stderr.on('data', d => { out += d })
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('server did not start:\n' + out)
})
after(() => { if (proc) proc.kill('SIGTERM') })

const post = (p, opts = {}) => fetch(`${BASE}${p}`, { method: 'POST', ...opts })

test('health reports dependencies', { skip }, async () => {
  const r = await fetch(`${BASE}/health`)
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { ok: true, db: true, redis: true })
})

test('lists 90 seeded desks without extra columns', { skip }, async () => {
  const desks = await (await fetch(`${BASE}/desks`)).json()
  assert.equal(desks.length, 90)
  assert.deepEqual(Object.keys(desks[0]).sort(), ['away_at', 'checkin_at', 'col_num', 'id', 'row_num', 'state_at', 'status', 'zone'])
})

test('desk lifecycle enforces valid transitions', { skip }, async () => {
  let r = await post('/desks/A-01/checkin')
  assert.equal(r.status, 200)
  assert.equal((await r.json()).status, 'occupied')

  r = await post('/desks/A-01/checkin')
  assert.equal(r.status, 409, 'cannot check in over an occupied desk')
  assert.match((await r.json()).error, /already occupied/)

  r = await post('/desks/A-01/away');      assert.equal(r.status, 200)
  r = await post('/desks/A-01/away');      assert.equal(r.status, 409)
  r = await post('/desks/A-01/checkin');   assert.equal(r.status, 200, 'returning from away is allowed')
  r = await post('/desks/A-01/stillhere'); assert.equal(r.status, 200)
  r = await post('/desks/A-01/checkout');  assert.equal(r.status, 200)
  r = await post('/desks/A-01/checkout');  assert.equal(r.status, 409)
  r = await post('/desks/A-02/stillhere'); assert.equal(r.status, 409, 'no session to confirm on a free desk')
})

test('rejects invalid and unknown desk ids', { skip }, async () => {
  assert.equal((await post('/desks/../etc/checkin')).status, 404)
  assert.equal((await post('/desks/Z-99/checkin')).status, 400)
  assert.equal((await post("/desks/A-01';--/checkin")).status, 400)
  assert.equal((await post('/desks/A-99/checkin')).status, 404)
})

test('librarian endpoints require the header key', { skip }, async () => {
  assert.equal((await fetch(`${BASE}/librarian/log`)).status, 401)
  assert.equal((await fetch(`${BASE}/librarian/log?key=${KEY}`)).status, 401, 'query-string keys are not accepted')
  assert.equal((await fetch(`${BASE}/librarian/log`, { headers: { 'X-Api-Key': 'wrong' } })).status, 401)
  const r = await fetch(`${BASE}/librarian/log`, { headers: { 'X-Api-Key': KEY } })
  assert.equal(r.status, 200)
  assert.ok(Array.isArray(await r.json()))
  assert.equal(r.headers.get('cache-control'), 'no-store')
})

test('QR sheet links to the public site, not the API host', { skip }, async () => {
  const r = await fetch(`${BASE}/librarian/qr-sheet`, { headers: { 'X-Api-Key': KEY } })
  assert.equal(r.status, 200)
  const html = await r.text()
  assert.match(html, /Codes link to https:\/\/site\.example/)
  const qr = await (await fetch(`${BASE}/desks/qr/B-03`)).json()
  assert.equal(qr.url, 'https://site.example/live?checkin=B-03')
})

test('librarian reset frees a desk and reset-all clears abandoned desks', { skip }, async () => {
  await post('/desks/C-01/checkin')
  const r = await post('/librarian/reset/C-01', { headers: { 'X-Api-Key': KEY } })
  assert.equal(r.status, 200)
  assert.equal((await r.json()).desk.status, 'free')
  const all = await post('/librarian/reset-all', { headers: { 'X-Api-Key': KEY } })
  assert.equal(all.status, 200)
})

test('contact form validates, stores, and is readable only by staff', { skip }, async () => {
  const send = (body) => post('/contact', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  let r = await send({ name: '', email: 'not-an-email' })
  assert.equal(r.status, 400)
  const bad = await r.json()
  assert.ok(bad.fields.name && bad.fields.email)

  r = await send({ name: 'Ada', email: 'ada@uni.example', institution: 'Uni', floors: '2-5', message: 'Hello <b>there</b>' })
  assert.equal(r.status, 201)

  r = await send({ name: 'Bot', email: 'bot@x.example', website: 'http://spam' })
  assert.equal(r.status, 201, 'honeypot submissions get a fake success')

  assert.equal((await fetch(`${BASE}/librarian/contact-requests`)).status, 401)
  const list = await (await fetch(`${BASE}/librarian/contact-requests`, { headers: { 'X-Api-Key': KEY } })).json()
  assert.equal(list.length, 1, 'honeypot submission was not stored')
  assert.equal(list[0].message, 'Hello <b>there</b>', 'stored verbatim; never rendered as HTML')
})

test('malformed JSON and oversized bodies return clean errors', { skip }, async () => {
  let r = await post('/contact', { headers: { 'Content-Type': 'application/json' }, body: '{bad' })
  assert.equal(r.status, 400)
  assert.deepEqual(await r.json(), { error: 'Invalid JSON body' })
  r = await post('/contact', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(20000) }) })
  assert.equal(r.status, 413)
})

test('CORS only allows configured origins and sends security headers', { skip }, async () => {
  const ok = await fetch(`${BASE}/desks`, { headers: { Origin: 'https://allowed.example' } })
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://allowed.example')
  const bad = await fetch(`${BASE}/desks`, { headers: { Origin: 'https://deskguard-evil.vercel.app' } })
  assert.equal(bad.headers.get('access-control-allow-origin'), null)
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff')
  assert.match(ok.headers.get('content-security-policy') || '', /frame-ancestors 'none'/)
  assert.equal(ok.headers.get('x-powered-by'), null)
})

test('unknown API routes return JSON 404 without internals', { skip }, async () => {
  const r = await fetch(`${BASE}/nope`)
  assert.equal(r.status, 404)
  assert.deepEqual(await r.json(), { error: 'Not found' })
})

test('contact endpoint is rate limited', { skip }, async () => {
  let last
  for (let i = 0; i < 6; i++) {
    last = await post('/contact', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'n', email: 'bad' }) })
  }
  assert.equal(last.status, 429)
  assert.ok(last.headers.get('retry-after'))
})

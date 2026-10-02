import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeEqual, isStrongKey, rateLimit } from '../src/lib/security.js'

test('safeEqual compares exactly', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(safeEqual('abc', 'abcd'), false)
})

test('isStrongKey rejects placeholders and short keys', () => {
  assert.equal(isStrongKey(undefined), false)
  assert.equal(isStrongKey('changeme'), false)
  assert.equal(isStrongKey('short-key'), false)
  assert.equal(isStrongKey('a-long-random-key-1234'), true)
})

test('rateLimit blocks after max requests per window', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 2 })
  const req = { ip: '1.2.3.4' }
  const res = () => {
    const r = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json() { return this } }
    return r
  }
  let passed = 0
  for (let i = 0; i < 3; i++) { const r = res(); mw(req, r, () => passed++); if (i === 2) assert.equal(r.code, 429) }
  assert.equal(passed, 2)
})

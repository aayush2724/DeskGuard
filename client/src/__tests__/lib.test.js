import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseDeskId } from '../lib/deskId.js'
import { countByStatus, statusMeta, timeSince } from '../lib/status.js'
import { friendlyError, ApiError } from '../api.js'

describe('parseDeskId', () => {
  it('reads the desk from a check-in URL', () => {
    expect(parseDeskId('https://deskguard-jade.vercel.app/live?checkin=A-01')).toBe('A-01')
    expect(parseDeskId('http://localhost:6111/live?checkin=e-20')).toBe('E-20')
  })
  it('accepts bare desk codes and normalises them', () => {
    expect(parseDeskId('B-07')).toBe('B-07')
    expect(parseDeskId(' c3 ')).toBe('C-03')
  })
  it('rejects anything else', () => {
    expect(parseDeskId('https://evil.example/?checkin=<script>')).toBe('')
    expect(parseDeskId('https://example.com/')).toBe('')
    expect(parseDeskId('Z-01')).toBe('')
    expect(parseDeskId('hello A-01 world')).toBe('')
  })
})

describe('status helpers', () => {
  it('counts pending desks as away', () => {
    const c = countByStatus([{ status: 'free' }, { status: 'still_here_pending' }, { status: 'away' }, { status: 'bogus' }])
    expect(c).toEqual({ free: 1, occupied: 0, away: 2, abandoned: 0 })
  })
  it('falls back to free for unknown statuses', () => {
    expect(statusMeta('nope').label).toBe('Free')
  })
  it('formats relative times', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-02T12:00:00Z'))
    expect(timeSince(null)).toBe('—')
    expect(timeSince('2026-10-02T11:59:30Z')).toBe('30s ago')
    expect(timeSince('2026-10-02T09:45:00Z')).toBe('2h 15m ago')
    vi.useRealTimers()
  })
})

describe('friendlyError', () => {
  it('never exposes raw server errors for 5xx', () => {
    const msg = friendlyError(new ApiError('x', { status: 500, data: { error: 'relation "desks" does not exist' } }))
    expect(msg).not.toMatch(/relation/)
  })
  it('shows safe server messages for conflicts', () => {
    expect(friendlyError(new ApiError('x', { status: 409, data: { error: 'This desk is already occupied.' } }))).toBe('This desk is already occupied.')
  })
  it('explains network and timeout failures', () => {
    expect(friendlyError(new ApiError('x', { status: 0 }))).toMatch(/reach/)
    expect(friendlyError(new ApiError('x', { status: 0, timeout: true }))).toMatch(/waking up/)
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/reach/)
  })
})

describe('myDesks (local only)', () => {
  beforeEach(() => {
    const store = {}
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    }
  })
  it('remembers and forgets desks', async () => {
    const m = await import('../lib/myDesks.js')
    m.addMyDesk('A-01'); m.addMyDesk('A-01'); m.addMyDesk('B-02')
    expect(m.getMyDesks()).toEqual(['A-01', 'B-02'])
    expect(m.isMyDesk('A-01')).toBe(true)
    m.removeMyDesk('A-01')
    expect(m.isMyDesk('A-01')).toBe(false)
  })
})

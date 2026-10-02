import crypto from 'crypto'

/**
 * In-memory fixed-window rate limiter keyed by client IP.
 * Single-instance only: if the API is ever scaled horizontally, move this to Redis.
 */
export function rateLimit({ windowMs = 60_000, max = 60, message = 'Too many requests', keyPrefix = '' } = {}) {
  const buckets = new Map()
  // Evict expired buckets so memory stays bounded under many distinct IPs
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of buckets) if (now - v.start > windowMs) buckets.delete(k)
  }, Math.max(windowMs, 30_000))
  sweeper.unref()

  return (req, res, next) => {
    const key = keyPrefix + (req.ip || 'unknown')
    const now = Date.now()
    let entry = buckets.get(key)
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 }
      buckets.set(key, entry)
    }
    entry.count++
    const remaining = Math.max(0, max - entry.count)
    res.setHeader('RateLimit-Limit', String(max))
    res.setHeader('RateLimit-Remaining', String(remaining))
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.start + windowMs - now) / 1000)))
      return res.status(429).json({ error: message })
    }
    next()
  }
}

/** Constant-time string comparison (avoids leaking key contents through timing). */
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

const WEAK_KEYS = new Set(['changeme', 'password', 'secret', 'admin', 'librarian'])

/** A librarian key is only usable if it is long and not a placeholder. */
export function isStrongKey(key) {
  return typeof key === 'string' && key.length >= 16 && !WEAK_KEYS.has(key.toLowerCase())
}

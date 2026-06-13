import Redis from 'ioredis'
import dotenv from 'dotenv'
dotenv.config()

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
})

redis.on('connect', () => console.log('[redis] Connected'))
redis.on('error', (err) => console.error('[redis] Error:', err.message))

export default redis

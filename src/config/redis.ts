import Redis from 'ioredis'
import { env } from './env'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (err) => {
  console.error('Redis error:', err.message)
})

// ─── Key helpers ──────────────────────────────────────────────────────────────

export const RedisKeys = {
  siweNonce: (address: string) => `siwe:nonce:${address.toLowerCase()}`,
  jwtBlacklist: (jti: string) => `jwt:blacklist:${jti}`,
  rateLimit: (ip: string) => `rate:${ip}`,
  exchangeRate: (pair: string) => `rate:${pair.toUpperCase()}`,
  reputationCache: (userId: string) => `reputation:${userId}`,
} as const

// ─── TTL constants (seconds) ──────────────────────────────────────────────────

export const RedisTTL = {
  SIWE_NONCE: 5 * 60,         // 5 minutes
  JWT_BLACKLIST: 30 * 24 * 60 * 60, // 30 days
  EXCHANGE_RATE: 10 * 60,     // 10 minutes
  REPUTATION: 30 * 60,        // 30 minutes
} as const

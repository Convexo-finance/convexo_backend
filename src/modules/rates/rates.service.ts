import { db } from '../../config/database'
import { redis, RedisKeys, RedisTTL } from '../../config/redis'
import { NotFoundError } from '../../shared/errors'
import type { UpsertRateInput } from './rates.schema'

// ─── Admin — upsert a rate ────────────────────────────────────────────────────

export async function upsertRate(input: UpsertRateInput) {
  const pair = input.pair.toUpperCase()

  const rate = await db.exchangeRate.upsert({
    where:  { pair },
    create: { pair, rate: input.rate, source: input.source },
    update: { rate: input.rate, source: input.source },
  })

  // Bust the Redis cache immediately so fresh rate is served
  await redis.del(RedisKeys.exchangeRate(pair))

  return rate
}

// ─── Admin — delete a rate ────────────────────────────────────────────────────

export async function deleteRate(pair: string): Promise<void> {
  const key = pair.toUpperCase()
  const existing = await db.exchangeRate.findUnique({ where: { pair: key } })
  if (!existing) throw new NotFoundError(`Rate pair ${key}`)

  await db.exchangeRate.delete({ where: { pair: key } })
  await redis.del(RedisKeys.exchangeRate(key))
}

// ─── Public — list all rates ──────────────────────────────────────────────────

export async function listRates() {
  return db.exchangeRate.findMany({ orderBy: { pair: 'asc' } })
}

// ─── Public — get rate by pair (Redis-cached) ─────────────────────────────────

export async function getRate(pair: string): Promise<{ pair: string; rate: number; source: string; updatedAt: Date }> {
  const key = pair.toUpperCase()

  // Try Redis first
  const cached = await redis.get(RedisKeys.exchangeRate(key))
  if (cached) {
    return JSON.parse(cached)
  }

  const rate = await db.exchangeRate.findUnique({ where: { pair: key } })
  if (!rate) throw new NotFoundError(`Rate pair ${key}`)

  // Cache it
  await redis.setex(RedisKeys.exchangeRate(key), RedisTTL.EXCHANGE_RATE, JSON.stringify(rate))

  return rate
}

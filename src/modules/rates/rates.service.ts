import { db } from '../../config/database'
import { redis, RedisKeys, RedisTTL } from '../../config/redis'
import { NotFoundError } from '../../shared/errors'
import { logger } from '../../shared/logger'
import { env } from '../../config/env'
import { isSupportedChain, SUPPORTED_CHAINS, type SupportedChainId } from '../../config/chains'
import { getKeeperWalletClient, getKeeperAccount } from '../../shared/viem'
import type { UpsertRateInput } from './rates.schema'

// ─── ManualPriceAggregator ABI (minimal) ─────────────────────────────────────

const MANUAL_PRICE_AGGREGATOR_ABI = [
  {
    name: 'setPrice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'price', type: 'int256' }],
    outputs: [],
  },
] as const

/**
 * Push the USDC-COP rate to the ManualPriceAggregator on-chain.
 * Converts the floating-point rate to Chainlink 8-decimal int256.
 * Logs success/failure but never throws — rate DB update must succeed regardless.
 */
async function syncRateOnChain(rate: number): Promise<void> {
  const aggregatorAddr = env.MANUAL_PRICE_AGGREGATOR_ADDRESS
  if (!aggregatorAddr) {
    logger.debug('[rates] MANUAL_PRICE_AGGREGATOR_ADDRESS not set — skipping on-chain sync')
    return
  }

  if (!env.KEEPER_PRIVATE_KEY) {
    logger.warn('[rates] KEEPER_PRIVATE_KEY not set — skipping on-chain sync')
    return
  }

  const chainId = env.POOL_KEEPER_CHAIN_ID
  if (!isSupportedChain(chainId)) {
    logger.warn({ chainId }, '[rates] POOL_KEEPER_CHAIN_ID is not a supported chain — skipping on-chain sync')
    return
  }

  try {
    // Convert to Chainlink 8-decimal int256: e.g. 4200.5 → 420050000000n
    const price = BigInt(Math.round(rate * 1e8))

    const safeChainId = chainId as SupportedChainId
    const walletClient = getKeeperWalletClient(safeChainId)
    const chain = SUPPORTED_CHAINS[safeChainId]
    const account = getKeeperAccount()

    const txHash = await walletClient.writeContract({
      chain,
      account,
      address: aggregatorAddr as `0x${string}`,
      abi: MANUAL_PRICE_AGGREGATOR_ABI,
      functionName: 'setPrice',
      args: [price],
    })

    logger.info({ chainId, rate, price: price.toString(), txHash }, '[rates] on-chain price updated')
  } catch (err) {
    const error = err as Error
    logger.error(
      { err: error.message, rate },
      '[rates] failed to sync rate on-chain — DB update succeeded',
    )
  }
}

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

  // Sync USDC-COP rate to on-chain ManualPriceAggregator (fire-and-forget)
  if (pair === 'USDC-COP') {
    void syncRateOnChain(input.rate)
  }

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

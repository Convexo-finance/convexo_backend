import { env } from '../../config/env'
import { isSupportedChain, type SupportedChainId } from '../../config/chains'
import { logger } from '../../shared/logger'
import { fetchPoolStatusFromChain, triggerRebalance, isCooldownActive } from './pool.service'

// ─── Configuration ────────────────────────────────────────────────────────────

const KEEPER_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

// ─── State ────────────────────────────────────────────────────────────────────

let keeperTimer: ReturnType<typeof setInterval> | null = null

// ─── Core tick logic ──────────────────────────────────────────────────────────

async function keeperTick(chainId: SupportedChainId): Promise<void> {
  const now = new Date().toISOString()
  logger.info({ chainId, at: now }, '[pool-keeper] tick started')

  try {
    // Always fetch fresh from chain so we have the latest state
    const status = await fetchPoolStatusFromChain(chainId)

    logger.info(
      {
        chainId,
        deviationBps: status.deviationBps,
        needsRebalance: status.needsRebalance,
        cooldownActive: isCooldownActive(status),
        poolPrice: status.poolPrice,
        oraclePrice: status.oraclePrice,
      },
      '[pool-keeper] pool status',
    )

    if (status.needsRebalance && !isCooldownActive(status)) {
      logger.info({ chainId }, '[pool-keeper] rebalance triggered — sending tx')

      const txHash = await triggerRebalance(chainId)

      logger.info({ chainId, txHash }, '[pool-keeper] rebalance tx sent')
    } else if (status.needsRebalance && isCooldownActive(status)) {
      logger.info({ chainId }, '[pool-keeper] rebalance needed but cooldown active — skipping')
    } else {
      logger.info({ chainId }, '[pool-keeper] pool is balanced — no action needed')
    }
  } catch (err) {
    // Never let keeper errors crash the server
    const error = err as Error
    logger.error(
      { chainId, err: error.message, stack: error.stack },
      '[pool-keeper] tick error — continuing',
    )
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the pool keeper background loop.
 * Reads POOL_KEEPER_CHAIN_ID from env (defaults to 1301 — Unichain Sepolia).
 * Runs immediately on start, then every 5 minutes.
 */
export function startPoolKeeper(): void {
  if (keeperTimer !== null) {
    logger.warn('[pool-keeper] already running — ignoring startPoolKeeper() call')
    return
  }

  const rawChainId = env.POOL_KEEPER_CHAIN_ID
  if (!isSupportedChain(rawChainId)) {
    logger.error(
      { chainId: rawChainId },
      '[pool-keeper] POOL_KEEPER_CHAIN_ID is not a supported chain — keeper will not start',
    )
    return
  }

  const chainId = rawChainId as SupportedChainId

  // Validate required addresses are set before starting
  if (!env.CONVEXO_HOOK_ADDRESS || !env.USDC_ADDRESS || !env.ECOP_ADDRESS) {
    logger.warn(
      '[pool-keeper] CONVEXO_HOOK_ADDRESS, USDC_ADDRESS, or ECOP_ADDRESS not set — keeper will not start',
    )
    return
  }

  if (!env.KEEPER_PRIVATE_KEY) {
    logger.warn('[pool-keeper] KEEPER_PRIVATE_KEY not set — keeper will not start')
    return
  }

  logger.info({ chainId, intervalMs: KEEPER_INTERVAL_MS }, '[pool-keeper] starting')

  // Fire immediately, then on interval
  void keeperTick(chainId)
  keeperTimer = setInterval(() => void keeperTick(chainId), KEEPER_INTERVAL_MS)
}

/**
 * Stop the pool keeper background loop.
 */
export function stopPoolKeeper(): void {
  if (keeperTimer !== null) {
    clearInterval(keeperTimer)
    keeperTimer = null
    logger.info('[pool-keeper] stopped')
  }
}

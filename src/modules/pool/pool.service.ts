import { getAddress } from 'viem'
import { env } from '../../config/env'
import { redis } from '../../config/redis'
import { isSupportedChain, SUPPORTED_CHAINS, type SupportedChainId } from '../../config/chains'
import { getPublicClient, getKeeperWalletClient, getKeeperAccount } from '../../shared/viem'
import { NotFoundError, BadRequestError } from '../../shared/errors'
import type { PoolStatus } from './pool.schema'

// ─── Redis key + TTL ──────────────────────────────────────────────────────────

const POOL_STATUS_KEY = (chainId: number) => `pool:status:${chainId}`
const POOL_STATUS_TTL = 60 // seconds

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────

/**
 * PoolKey struct as viem expects for tuple encoding:
 * { currency0, currency1, fee, tickSpacing, hooks }
 */
const POOL_KEY_ABI_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

const CONVEXO_HOOK_ABI = [
  {
    name: 'getPoolPriceStatus',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: POOL_KEY_ABI_COMPONENTS,
      },
    ],
    outputs: [
      { name: 'poolSqrt', type: 'uint160' },
      { name: 'oracleSqrt', type: 'uint160' },
      { name: 'deviationBps', type: 'uint256' },
      { name: 'needsRebalance', type: 'bool' },
    ],
  },
  {
    name: 'lastRebalanceAt',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'rebalanceCooldown',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'rebalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: POOL_KEY_ABI_COMPONENTS,
      },
    ],
    outputs: [],
  },
] as const

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a sqrtPriceX96 (uint160) to a human-readable price ratio.
 * price = (sqrtPriceX96 / 2^96)^2
 * Result is expressed as "token1 per token0".
 */
function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 === 0n) return 0
  const Q96 = 2n ** 96n
  // Use floating-point arithmetic — precision is sufficient for display
  const ratio = Number(sqrtPriceX96) / Number(Q96)
  return ratio * ratio
}

/**
 * Build the PoolKey for the USDC/ECOP pool.
 * currency0 is the lower address (lexicographic), currency1 is the higher.
 */
function buildPoolKey(
  usdcAddress: `0x${string}`,
  ecopAddress: `0x${string}`,
  hookAddress: `0x${string}`,
) {
  const usdc = getAddress(usdcAddress)
  const ecop = getAddress(ecopAddress)
  // Sort by lowercase hex value
  const [currency0, currency1] =
    usdc.toLowerCase() < ecop.toLowerCase()
      ? [usdc, ecop]
      : [ecop, usdc]

  return {
    currency0: currency0 as `0x${string}`,
    currency1: currency1 as `0x${string}`,
    fee: 500,
    tickSpacing: 10,
    hooks: hookAddress,
  }
}

/**
 * Resolve and validate the three required contract addresses from env.
 * Throws BadRequestError if any are missing.
 */
function resolveContractAddresses() {
  const hookAddr = env.CONVEXO_HOOK_ADDRESS
  const usdcAddr = env.USDC_ADDRESS
  const ecopAddr = env.ECOP_ADDRESS

  if (!hookAddr || !usdcAddr || !ecopAddr) {
    throw new BadRequestError(
      'Pool keeper contract addresses not configured: CONVEXO_HOOK_ADDRESS, USDC_ADDRESS, ECOP_ADDRESS must all be set',
    )
  }

  return {
    hookAddress: hookAddr as `0x${string}`,
    usdcAddress: usdcAddr as `0x${string}`,
    ecopAddress: ecopAddr as `0x${string}`,
  }
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetch the full pool status from chain and cache in Redis.
 */
export async function fetchPoolStatusFromChain(chainId: SupportedChainId): Promise<PoolStatus> {
  if (!isSupportedChain(chainId)) {
    throw new BadRequestError(`Chain ${chainId} is not supported`)
  }

  const { hookAddress, usdcAddress, ecopAddress } = resolveContractAddresses()
  const publicClient = getPublicClient(chainId)
  const poolKey = buildPoolKey(usdcAddress, ecopAddress, hookAddress)

  // Read token balances — available regardless of hook phase
  const [reserveUsdc, reserveEcop] = await Promise.all([
    publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [hookAddress],
    }),
    publicClient.readContract({
      address: ecopAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [hookAddress],
    }),
  ])

  // Try Phase 2 oracle functions — PassportGatedHook (Phase 1) does not have these;
  // catch the revert and return a degraded status rather than a 500.
  let poolSqrt = 0n
  let oracleSqrt = 0n
  let deviationBpsBig = 0n
  let needsRebalance = false
  let lastRebalanceAtRaw = 0n
  let rebalanceCooldownRaw = 0n
  let isPhase2 = false

  try {
    const [priceStatus, lastAt, cooldown] = await Promise.all([
      publicClient.readContract({
        address: hookAddress,
        abi: CONVEXO_HOOK_ABI,
        functionName: 'getPoolPriceStatus',
        args: [poolKey],
      }),
      publicClient.readContract({
        address: hookAddress,
        abi: CONVEXO_HOOK_ABI,
        functionName: 'lastRebalanceAt',
      }),
      publicClient.readContract({
        address: hookAddress,
        abi: CONVEXO_HOOK_ABI,
        functionName: 'rebalanceCooldown',
      }),
    ])
    ;[poolSqrt, oracleSqrt, deviationBpsBig, needsRebalance] = priceStatus
    lastRebalanceAtRaw = lastAt
    rebalanceCooldownRaw = cooldown
    isPhase2 = true
  } catch {
    // Phase 1 hook (PassportGatedHook) — no oracle price band, no keeper functions.
    // Pool price and oracle price are unavailable until Phase 2 ConvexoPoolHook is deployed.
  }

  const usdcIsToken0 = usdcAddress.toLowerCase() < ecopAddress.toLowerCase()

  let poolPrice = 'N/A — Phase 1 hook'
  let oraclePrice = 'N/A — Phase 1 hook'

  if (isPhase2) {
    const poolRaw = sqrtPriceX96ToPrice(poolSqrt)
    const oracleRaw = sqrtPriceX96ToPrice(oracleSqrt)
    const poolPriceNum = usdcIsToken0 ? poolRaw : poolRaw > 0 ? 1 / poolRaw : 0
    const oraclePriceNum = usdcIsToken0 ? oracleRaw : oracleRaw > 0 ? 1 / oracleRaw : 0
    poolPrice = `${poolPriceNum.toFixed(2)} COP/USDC`
    oraclePrice = `${oraclePriceNum.toFixed(2)} COP/USDC`
  }

  const status: PoolStatus = {
    chainId,
    poolSqrtPriceX96: poolSqrt.toString(),
    oracleSqrtPriceX96: oracleSqrt.toString(),
    deviationBps: Number(deviationBpsBig),
    needsRebalance,
    lastRebalanceAt: lastRebalanceAtRaw === 0n ? null : Number(lastRebalanceAtRaw),
    rebalanceCooldownSeconds: Number(rebalanceCooldownRaw),
    oraclePrice,
    poolPrice,
    reserveUsdc: reserveUsdc.toString(),
    reserveEcop: reserveEcop.toString(),
    updatedAt: new Date().toISOString(),
  }

  await redis.setex(POOL_STATUS_KEY(chainId), POOL_STATUS_TTL, JSON.stringify(status))
  return status
}

/**
 * Get pool status — reads from Redis cache first, falls back to on-chain.
 */
export async function getPoolStatus(chainId: SupportedChainId): Promise<PoolStatus> {
  const cached = await redis.get(POOL_STATUS_KEY(chainId))
  if (cached) {
    return JSON.parse(cached) as PoolStatus
  }
  return fetchPoolStatusFromChain(chainId)
}

/**
 * Get pool status for any numeric chainId, validating it is supported.
 */
export async function getPoolStatusByChainId(chainId: number): Promise<PoolStatus> {
  if (!isSupportedChain(chainId)) {
    throw new NotFoundError(`Chain ${chainId}`)
  }
  return getPoolStatus(chainId)
}

/**
 * Send the rebalance transaction for the given chain.
 * Returns the transaction hash.
 */
export async function triggerRebalance(chainId: SupportedChainId): Promise<`0x${string}`> {
  const { hookAddress, usdcAddress, ecopAddress } = resolveContractAddresses()
  const walletClient = getKeeperWalletClient(chainId)
  const poolKey = buildPoolKey(usdcAddress, ecopAddress, hookAddress)
  const chain = SUPPORTED_CHAINS[chainId]
  const account = getKeeperAccount()

  const txHash = await walletClient.writeContract({
    chain,
    account,
    address: hookAddress,
    abi: CONVEXO_HOOK_ABI,
    functionName: 'rebalance',
    args: [poolKey],
  })

  // Invalidate cache so next read is fresh
  await redis.del(POOL_STATUS_KEY(chainId))

  return txHash
}

/**
 * Check whether the cooldown period has passed since the last rebalance.
 */
export function isCooldownActive(status: PoolStatus): boolean {
  if (status.lastRebalanceAt === null) return false
  const nowSeconds = Math.floor(Date.now() / 1000)
  return nowSeconds - status.lastRebalanceAt < status.rebalanceCooldownSeconds
}

import { db } from '../../config/database'
import { getPublicClient } from '../../shared/viem'
import { NFT_CONTRACTS, ERC721_BALANCE_ABI } from '../../config/contracts'
import { isSupportedChain, type SupportedChainId } from '../../config/chains'
import { BadRequestError } from '../../shared/errors'
import { logger } from '../../shared/logger'
import type { Address } from 'viem'

// ─── Read NFT balance from chain ──────────────────────────────────────────────

async function readBalance(
  client: ReturnType<typeof getPublicClient>,
  contract: Address,
  walletAddress: Address,
): Promise<bigint> {
  try {
    return await client.readContract({
      address:      contract,
      abi:          ERC721_BALANCE_ABI,
      functionName: 'balanceOf',
      args:         [walletAddress],
    })
  } catch (err) {
    logger.warn({ contract, err }, 'balanceOf read failed — returning 0')
    return 0n
  }
}

// ─── Compute tier from balances ───────────────────────────────────────────────

function computeTier(
  passport:      bigint,
  lpIndividuals: bigint,
  lpBusiness:    bigint,
  ecredit:       bigint,
  accountType:   string | null,
): { tier: number; tierName: string } {
  if (ecredit > 0n) return { tier: 3, tierName: 'Ecreditscoring' }

  if (accountType === 'INDIVIDUAL' && lpIndividuals > 0n) return { tier: 2, tierName: 'LP Individual' }
  if (accountType === 'BUSINESS'   && lpBusiness   > 0n) return { tier: 2, tierName: 'LP Business' }
  if (lpIndividuals > 0n || lpBusiness > 0n)             return { tier: 2, tierName: 'LP Member' }

  if (passport > 0n) return { tier: 1, tierName: 'ConvexoPassport' }

  return { tier: 0, tierName: 'None' }
}

// ─── Compute permissions from tier ───────────────────────────────────────────

function computePermissions(tier: number, accountType: string | null) {
  return {
    canAccessTreasury:     tier >= 1,
    canInvestInVaults:     tier >= 1,
    canAccessLPPools:      tier >= 2,
    canRequestCreditScore: tier >= 2 && accountType === 'BUSINESS',
    canCreateVaults:       tier >= 3,
    canAccessFunding:      tier >= 3 && accountType === 'BUSINESS',
  }
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncReputation(userId: string, chainId: number = 8453) {
  if (!isSupportedChain(chainId)) {
    throw new BadRequestError(`Unsupported chainId: ${chainId}`)
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { walletAddress: true, smartAccount: true, accountType: true },
  })

  // Use smart account address if available (holds the NFTs), else EOA
  const address = (user.smartAccount ?? user.walletAddress) as Address
  const client  = getPublicClient(chainId as SupportedChainId)

  const [passport, lpIndividuals, lpBusiness, ecredit] = await Promise.all([
    readBalance(client, NFT_CONTRACTS.CONVEXO_PASSPORT as Address, address),
    readBalance(client, NFT_CONTRACTS.LP_INDIVIDUALS   as Address, address),
    readBalance(client, NFT_CONTRACTS.LP_BUSINESS      as Address, address),
    readBalance(client, NFT_CONTRACTS.ECREDITSCORING   as Address, address),
  ])

  const { tier, tierName } = computeTier(
    passport, lpIndividuals, lpBusiness, ecredit, user.accountType,
  )

  const permissions = computePermissions(tier, user.accountType)

  const cache = await db.reputationCache.upsert({
    where:  { userId },
    create: {
      userId,
      tier,
      tierName,
      passportBalance:       passport.toString(),
      lpIndividualsBalance:  lpIndividuals.toString(),
      lpBusinessBalance:     lpBusiness.toString(),
      ecreditscoringBalance: ecredit.toString(),
      syncedFromChainId:     chainId,
      ...permissions,
    },
    update: {
      tier,
      tierName,
      passportBalance:       passport.toString(),
      lpIndividualsBalance:  lpIndividuals.toString(),
      lpBusinessBalance:     lpBusiness.toString(),
      ecreditscoringBalance: ecredit.toString(),
      syncedFromChainId:     chainId,
      lastSyncedAt:          new Date(),
      ...permissions,
    },
  })

  logger.info({ userId, tier, tierName, chainId }, 'Reputation synced')
  return cache
}

// ─── Get cached reputation ────────────────────────────────────────────────────

export async function getReputation(userId: string) {
  const cache = await db.reputationCache.findUnique({ where: { userId } })
  if (!cache) {
    return {
      tier: 0, tierName: 'None',
      passportBalance: '0', lpIndividualsBalance: '0',
      lpBusinessBalance: '0', ecreditscoringBalance: '0',
      canAccessTreasury: false, canInvestInVaults: false,
      canAccessLPPools: false, canRequestCreditScore: false,
      canCreateVaults: false, canAccessFunding: false,
      lastSyncedAt: null,
    }
  }
  return cache
}

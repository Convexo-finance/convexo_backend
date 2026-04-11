import { db } from '../../config/database'
import { NotFoundError, ConflictError } from '../../shared/errors'
import type { RegisterVaultInput, ListVaultsInput } from './vault.schema'

// ─── Admin — register vault after on-chain deployment ─────────────────────────

export async function registerVault(input: RegisterVaultInput) {
  // Check for duplicate vault address
  const existing = await db.vault.findUnique({ where: { vaultAddress: input.vaultAddress } })
  if (existing) throw new ConflictError('Vault already registered')

  const vault = await db.vault.create({
    data: {
      onchainVaultId:  input.onchainVaultId,
      vaultAddress:    input.vaultAddress.toLowerCase(),
      chainId:         input.chainId,
      name:            input.name,
      symbol:          input.symbol,
      principalAmount: input.principalAmount,
      interestRate:    input.interestRate,
      protocolFeeRate: input.protocolFeeRate,
      maturityDate:    input.maturityDate,
      totalShareSupply: input.totalShareSupply,
      minInvestment:   input.minInvestment,
      borrowerAddress: input.borrowerAddress.toLowerCase(),
      fundingRequestId: input.fundingRequestId,
      txHash:          input.txHash,
    },
  })

  // Update linked funding request to VAULT_CREATED
  if (input.fundingRequestId) {
    await db.fundingRequest.update({
      where: { id: input.fundingRequestId },
      data:  { status: 'VAULT_CREATED', vaultId: vault.vaultAddress },
    })
  }

  return vault
}

// ─── Public — list vaults ─────────────────────────────────────────────────────

export async function listVaults(query: ListVaultsInput) {
  const where: Record<string, unknown> = {}
  if (query.chainId) where['chainId'] = query.chainId

  const [items, total] = await Promise.all([
    db.vault.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
    }),
    db.vault.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

// ─── Public — get single vault ────────────────────────────────────────────────

export async function getVaultByAddress(vaultAddress: string) {
  const vault = await db.vault.findUnique({
    where: { vaultAddress: vaultAddress.toLowerCase() },
  })
  if (!vault) throw new NotFoundError('Vault')
  return vault
}

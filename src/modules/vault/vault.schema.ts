import { z } from 'zod'

export const registerVaultSchema = z.object({
  onchainVaultId:  z.string().min(1),
  vaultAddress:    z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainId:         z.coerce.number().int().default(84532),
  name:            z.string().min(1).max(100),
  symbol:          z.string().min(1).max(20),
  principalAmount: z.string().min(1),   // wei string (6 dec USDC)
  interestRate:    z.string().min(1),   // basis points string
  protocolFeeRate: z.string().min(1),
  maturityDate:    z.coerce.date(),
  totalShareSupply: z.string().min(1),
  minInvestment:   z.string().min(1),
  borrowerAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  fundingRequestId: z.string().optional(),
  txHash:          z.string().optional(),
})

export const listVaultsSchema = z.object({
  chainId: z.coerce.number().int().optional(),
  limit:   z.coerce.number().int().min(1).max(100).default(50),
  offset:  z.coerce.number().int().min(0).default(0),
})

export type RegisterVaultInput = z.infer<typeof registerVaultSchema>
export type ListVaultsInput    = z.infer<typeof listVaultsSchema>

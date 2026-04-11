import { z } from 'zod'

export const PoolStatusSchema = z.object({
  chainId: z.number(),
  poolSqrtPriceX96: z.string(),       // uint160 as string
  oracleSqrtPriceX96: z.string(),     // uint160 as string
  deviationBps: z.number(),           // e.g. 250 = 2.5%
  needsRebalance: z.boolean(),
  lastRebalanceAt: z.number().nullable(),  // unix timestamp
  rebalanceCooldownSeconds: z.number(),
  oraclePrice: z.string(),            // human-readable "4200.00 COP/USDC"
  poolPrice: z.string(),              // human-readable
  reserveUsdc: z.string(),            // raw balance as string
  reserveEcop: z.string(),            // raw balance as string
  updatedAt: z.string(),              // ISO timestamp
})

export type PoolStatus = z.infer<typeof PoolStatusSchema>

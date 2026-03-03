import { z } from 'zod'

export const upsertRateSchema = z.object({
  pair:   z.string().regex(/^[A-Z]{2,10}-[A-Z]{2,10}$/, 'Pair must be like USD-COP or ETH-USDC'),
  rate:   z.number().positive(),
  source: z.string().max(50).default('ADMIN'),
})

export type UpsertRateInput = z.infer<typeof upsertRateSchema>

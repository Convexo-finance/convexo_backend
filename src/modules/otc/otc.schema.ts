import { z } from 'zod'

export const createOtcOrderSchema = z.object({
  // Frontend-generated order ID (OTC-{timestamp})
  orderId:      z.string().max(30).optional(),

  orderType:    z.string().transform(v => v.toUpperCase()).pipe(z.enum(['BUY', 'SELL'])),

  // Fiat-OTC fields (new frontend format)
  digitalAsset:  z.enum(['USDC', 'USDT', 'ECOP']).optional(),
  fiatCurrency:  z.enum(['USD', 'COP']).optional(),
  assetAmount:   z.coerce.number().positive().optional(),
  estimatedFiat: z.coerce.number().positive().optional(),
  rate:          z.coerce.number().positive().optional(),
  walletAddress: z.string().optional(),
  timestamp:     z.string().optional(),

  // Sell order bank info
  bankName:     z.string().max(255).optional(),
  bankAccount:  z.string().max(100).optional(),
  accountType:  z.string().max(50).optional(),
  holderName:   z.string().max(255).optional(),
  accountLabel: z.string().max(255).optional(),

  // Legacy swap fields (still supported)
  tokenIn:  z.string().min(1).max(20).optional(),
  tokenOut: z.string().min(1).max(20).optional(),
  amountIn: z.string().min(1).optional(),
  network:  z.string().min(1).max(50).optional(),
  notes:    z.string().max(500).optional(),
})

export const updateOtcOrderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  notes:  z.string().max(500).optional(),
})

export const listOtcOrdersSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type CreateOtcOrderInput       = z.infer<typeof createOtcOrderSchema>
export type UpdateOtcOrderStatusInput = z.infer<typeof updateOtcOrderStatusSchema>
export type ListOtcOrdersInput        = z.infer<typeof listOtcOrdersSchema>

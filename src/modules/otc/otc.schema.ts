import { z } from 'zod'

export const createOtcOrderSchema = z.object({
  orderType: z.enum(['BUY', 'SELL']),
  tokenIn:   z.string().min(1).max(20),    // token the user is sending (e.g. USDC, ETH, COP)
  tokenOut:  z.string().min(1).max(20),    // token the user wants to receive
  amountIn:  z.string().min(1),            // amount as string (e.g. "1500000")
  network:   z.string().min(1).max(50),    // e.g. "base", "unichain"
  notes:     z.string().max(500).optional(),
})

export const updateOtcOrderStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  notes:  z.string().max(500).optional(),
})

export const listOtcOrdersSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type CreateOtcOrderInput       = z.infer<typeof createOtcOrderSchema>
export type UpdateOtcOrderStatusInput = z.infer<typeof updateOtcOrderStatusSchema>
export type ListOtcOrdersInput        = z.infer<typeof listOtcOrdersSchema>

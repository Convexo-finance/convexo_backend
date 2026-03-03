import { z } from 'zod'

export const createFundingRequestSchema = z.object({
  amount:       z.string().min(1),                    // e.g. "100000"
  currency:     z.string().length(4).default('USDC'),
  purpose:      z.string().min(10).max(1000),
  term:         z.coerce.number().int().min(1).max(360).optional(), // months
  interestRate: z.string().optional(),                // e.g. "8.5"
  collateral:   z.string().max(500).optional(),
})

export const reviewFundingRequestSchema = z.object({
  status:     z.enum(['APPROVED', 'REJECTED', 'UNDER_REVIEW']),
  adminNotes: z.string().max(1000).optional(),
  vaultId:    z.string().optional(),
})

export const listFundingRequestsSchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'VAULT_CREATED']).optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type CreateFundingRequestInput = z.infer<typeof createFundingRequestSchema>
export type ReviewFundingRequestInput = z.infer<typeof reviewFundingRequestSchema>
export type ListFundingRequestsInput  = z.infer<typeof listFundingRequestsSchema>

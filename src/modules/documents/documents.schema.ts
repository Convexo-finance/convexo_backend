import { z } from 'zod'

export const listDocumentsSchema = z.object({
  category: z.enum([
    'GENERAL',
    'VAULT_CONTRACT',
    'KYC_DOCUMENT',
    'KYB_DOCUMENT',
    'INCOME_STATEMENT',
    'BALANCE_SHEET',
    'CASH_FLOW',
    'CREDIT_SCORE_REQUEST',
    'FUNDING_REQUEST',
    'NFT_METADATA',
  ]).optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>

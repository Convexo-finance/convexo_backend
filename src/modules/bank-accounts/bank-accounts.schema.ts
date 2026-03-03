import { z } from 'zod'

export const createBankAccountSchema = z.object({
  accountName:    z.string().min(1).max(100),
  bankName:       z.string().min(1).max(100),
  accountNumber:  z.string().min(4).max(30),   // plain-text, will be masked + encrypted
  accountType:    z.enum(['SAVINGS', 'CHECKING', 'BUSINESS']),
  currency:       z.string().length(3).default('COP'),
  holderName:     z.string().min(1).max(150).optional(),
  isDefault:      z.boolean().optional().default(false),
})

export const updateBankAccountSchema = z.object({
  accountName: z.string().min(1).max(100).optional(),
  bankName:    z.string().min(1).max(100).optional(),
  accountType: z.enum(['SAVINGS', 'CHECKING', 'BUSINESS']).optional(),
  currency:    z.string().length(3).optional(),
  holderName:  z.string().min(1).max(150).optional(),
  isDefault:   z.boolean().optional(),
})

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>

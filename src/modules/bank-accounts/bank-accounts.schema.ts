import { z } from 'zod'

export const createBankAccountSchema = z.object({
  accountName:    z.string().min(1).max(100),
  bankName:       z.string().min(1).max(100),
  accountNumber:  z.string().min(4).max(30),
  accountType:    z.enum(['SAVINGS', 'CHECKING', 'BUSINESS']),
  currency:       z.string().length(3).default('COP'),
  isDefault:      z.boolean().optional().default(false),

  holderName:     z.string().min(1).max(255),
  bankCountry:    z.string().min(2).max(10),
  documentType:   z.string().min(1).max(100),
  documentNumber: z.string().min(1).max(100),
  bankAddress:    z.string().min(1).max(500),
  bankCity:       z.string().min(1).max(100),
  bankState:      z.string().max(100).optional(),
  swiftCode:      z.string().max(20).optional(),
  routingNumber:  z.string().max(20).optional(),
  iban:           z.string().max(50).optional(),
})

export const updateBankAccountSchema = z.object({
  accountName:    z.string().min(1).max(100).optional(),
  bankName:       z.string().min(1).max(100).optional(),
  accountType:    z.enum(['SAVINGS', 'CHECKING', 'BUSINESS']).optional(),
  currency:       z.string().length(3).optional(),
  isDefault:      z.boolean().optional(),

  holderName:     z.string().min(1).max(255).optional(),
  bankCountry:    z.string().min(2).max(10).optional(),
  documentType:   z.string().min(1).max(100).optional(),
  documentNumber: z.string().min(1).max(100).optional(),
  bankAddress:    z.string().min(1).max(500).optional(),
  bankCity:       z.string().min(1).max(100).optional(),
  bankState:      z.string().max(100).optional(),
  swiftCode:      z.string().max(20).optional(),
  routingNumber:  z.string().max(20).optional(),
  iban:           z.string().max(50).optional(),
})

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>

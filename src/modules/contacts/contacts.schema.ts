import { z } from 'zod'

export const createContactSchema = z.object({
  name:      z.string().min(1).max(100),
  address:   z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address'),
  type:      z.enum(['PROVIDER', 'FRIEND', 'CLIENT', 'FAMILY', 'OTHER']).default('OTHER'),
  notes:     z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
})

export const updateContactSchema = z.object({
  name:      z.string().min(1).max(100).optional(),
  type:      z.enum(['PROVIDER', 'FRIEND', 'CLIENT', 'FAMILY', 'OTHER']).optional(),
  notes:     z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
})

export const listContactsSchema = z.object({
  search: z.string().optional(),
  type:   z.enum(['PROVIDER', 'FRIEND', 'CLIENT', 'FAMILY', 'OTHER']).optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type CreateContactInput = z.infer<typeof createContactSchema>
export type UpdateContactInput = z.infer<typeof updateContactSchema>
export type ListContactsInput  = z.infer<typeof listContactsSchema>

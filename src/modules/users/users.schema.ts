import { z } from 'zod'

export const updateUserSchema = z.object({
  chainId: z.number().int().positive().optional(),
  authMethod: z
    .enum(['EMAIL', 'PASSKEY', 'GOOGLE', 'WALLET_CONNECT', 'METAMASK', 'COINBASE', 'EXTERNAL_EOA'])
    .optional(),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>

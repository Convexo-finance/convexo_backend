import { z } from 'zod'

export const getNonceSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
})

export const verifySchema = z.object({
  message: z.string().min(1, 'Message is required'),
  signature: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature format'),
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  chainId: z.number().int().positive().optional(),
  authMethod: z
    .enum(['EMAIL', 'PASSKEY', 'GOOGLE', 'WALLET_CONNECT', 'METAMASK', 'COINBASE', 'EXTERNAL_EOA'])
    .optional()
    .default('EXTERNAL_EOA'),
  smartAccount: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid smart account address')
    .optional(),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export type GetNonceInput = z.infer<typeof getNonceSchema>
export type VerifyInput = z.infer<typeof verifySchema>
export type RefreshInput = z.infer<typeof refreshSchema>

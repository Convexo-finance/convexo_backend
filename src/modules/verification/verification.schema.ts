import { z } from 'zod'

// ─── Start Humanity (ZKPassport) ──────────────────────────────────────────────
export const startHumanitySchema = z.object({
  chainId: z.number().int().positive().optional().default(8453),
})

// ─── Start KYC (Veriff — Individual) ─────────────────────────────────────────
export const startKycSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
})

// ─── Start KYB (Sumsub — Business) ───────────────────────────────────────────
export const startKybSchema = z.object({
  levelName: z.string().optional().default('kyb-standard'),
})

// ─── KYC (manual — direct-to-Storage uploads) ────────────────────────────────
export const kycUploadUrlSchema = z.object({
  fieldName: z.enum(['governmentId', 'proofOfAddress', 'rutDocument']),
})

export type StartHumanityInput    = z.infer<typeof startHumanitySchema>
export type StartKycInput         = z.infer<typeof startKycSchema>
export type StartKybInput         = z.infer<typeof startKybSchema>
export type KycUploadUrlInput     = z.infer<typeof kycUploadUrlSchema>

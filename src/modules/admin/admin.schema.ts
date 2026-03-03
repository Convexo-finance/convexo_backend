import { z } from 'zod'

// ─── User list ────────────────────────────────────────────────────────────────
export const listUsersSchema = z.object({
  search:      z.string().optional(),
  accountType: z.enum(['INDIVIDUAL', 'BUSINESS']).optional(),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
  offset:      z.coerce.number().int().min(0).default(0),
})

// ─── Admin role grant ─────────────────────────────────────────────────────────
export const grantAdminRoleSchema = z.object({
  userId: z.string().min(1),
  role:   z.enum(['VIEWER', 'VERIFIER', 'SUPER_ADMIN']),
})

// ─── Verification override ────────────────────────────────────────────────────
export const overrideVerificationSchema = z.object({
  status:          z.enum(['APPROVED', 'REJECTED', 'IN_PROGRESS']),
  rejectionReason: z.string().max(500).optional(),
  nftTokenId:      z.string().optional(),
})

// ─── Record NFT mint ──────────────────────────────────────────────────────────
export const recordNftSchema = z.object({
  nftTokenId: z.string().min(1),
})

// ─── Credit score manual override ────────────────────────────────────────────
export const overrideCreditScoreSchema = z.object({
  approved:        z.boolean(),
  score:           z.number().int().min(0).max(1000),
  rating:          z.string().min(1).max(20),
  maxCreditLimit:  z.string().optional(),
  analysisNotes:   z.string().max(1000).optional(),
  rejectionReason: z.string().max(500).optional(),
})

export type ListUsersInput            = z.infer<typeof listUsersSchema>
export type GrantAdminRoleInput       = z.infer<typeof grantAdminRoleSchema>
export type OverrideVerificationInput = z.infer<typeof overrideVerificationSchema>
export type RecordNftInput            = z.infer<typeof recordNftSchema>
export type OverrideCreditScoreInput  = z.infer<typeof overrideCreditScoreSchema>

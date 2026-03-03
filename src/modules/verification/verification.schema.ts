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

// ─── Credit Score Submit ──────────────────────────────────────────────────────
export const creditScoreSubmitSchema = z.object({
  period: z.string().min(1).max(20),               // e.g. "2024" or "Q3-2024"
  annualRevenue: z.string().min(1),
  netProfit: z.string().min(1),
  totalAssets: z.string().min(1),
  totalLiabilities: z.string().min(1),
  employeeCount: z.coerce.number().int().min(1),
  yearsOperating: z.coerce.number().int().min(0),
  existingDebt: z.string().min(1),
  monthlyExpenses: z.string().min(1),
  additionalContext: z.string().max(2000).optional(),
})

export type StartHumanityInput = z.infer<typeof startHumanitySchema>
export type StartKycInput = z.infer<typeof startKycSchema>
export type StartKybInput = z.infer<typeof startKybSchema>
export type CreditScoreSubmitInput = z.infer<typeof creditScoreSubmitSchema>

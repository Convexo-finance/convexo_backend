import { z } from 'zod'

/**
 * Per-document Credit Score extraction schemas. Mirrors the
 * `FinancialLineItems` interface in `shared/credit-score-indicators.ts`.
 *
 * All amounts are in the document's reporting currency (typically COP for
 * Colombian businesses). Frontend is responsible for currency display; the
 * indicator math is unit-free.
 */

const optionalAmount = z.number().nullable()
const optionalString = z.string().trim().min(1).nullable()

// ─── Balance Sheet ───────────────────────────────────────────────────────────

export const balanceSheetExtractionSchema = z.object({
  reportingDate:      optionalString,   // e.g. "2025-12-31"
  currency:           optionalString,   // e.g. "COP", "USD"
  totalAssets:        optionalAmount,
  currentAssets:      optionalAmount,
  cash:               optionalAmount,
  inventory:          optionalAmount,
  totalLiabilities:   optionalAmount,
  currentLiabilities: optionalAmount,
  longTermDebt:       optionalAmount,
  equity:             optionalAmount,
})
export type BalanceSheetExtraction = z.infer<typeof balanceSheetExtractionSchema>

// ─── Income Statement ────────────────────────────────────────────────────────

export const incomeStatementExtractionSchema = z.object({
  periodStart:     optionalString,
  periodEnd:       optionalString,
  currency:        optionalString,
  revenue:         optionalAmount,
  cogs:            optionalAmount,
  grossProfit:     optionalAmount,
  opex:            optionalAmount,
  ebitda:          optionalAmount,
  netIncome:       optionalAmount,
  interestExpense: optionalAmount,
  priorRevenue:    optionalAmount,    // optional — if document is comparative
})
export type IncomeStatementExtraction = z.infer<typeof incomeStatementExtractionSchema>

// ─── Cash Flow Statement ─────────────────────────────────────────────────────

export const cashFlowExtractionSchema = z.object({
  periodStart:        optionalString,
  periodEnd:          optionalString,
  currency:           optionalString,
  cashFromOperations: optionalAmount,
  cashFromInvesting:  optionalAmount,
  cashFromFinancing:  optionalAmount,
  netChangeInCash:    optionalAmount,
  freeCashFlow:       optionalAmount,
})
export type CashFlowExtraction = z.infer<typeof cashFlowExtractionSchema>

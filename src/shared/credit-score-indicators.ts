/**
 * Pure functions: financial line items → indicators → weighted score → tier.
 *
 * v1 thresholds are reasonable SME defaults — admin can always override the
 * final tier on `PUT /admin/credit-score-requests/:id/result`. No I/O, no
 * dependencies, fully unit-testable.
 *
 * Weighting and tier thresholds are documented in KYB-CREDIT-SCORE-PLAN.md §2.
 */

export interface FinancialLineItems {
  // Balance sheet
  totalAssets:        number
  currentAssets:      number
  cash:               number
  inventory:          number
  totalLiabilities:   number
  currentLiabilities: number
  longTermDebt:       number
  equity:             number

  // Income statement
  revenue:         number
  cogs:            number
  grossProfit:     number
  opex:            number
  ebitda:          number
  netIncome:       number
  interestExpense: number

  // Cash flow
  cashFromOperations: number
  cashFromInvesting:  number
  cashFromFinancing:  number
  netChangeInCash:    number
  freeCashFlow:       number

  // Optional second period (for revenue growth)
  priorRevenue?: number
}

export interface IndicatorBreakdown {
  currentRatio:           number | null
  debtToEquity:           number | null
  grossMargin:            number | null
  ebitdaMargin:           number | null
  interestCoverage:       number | null
  operatingCashFlowMargin:number | null
  revenueGrowth:          number | null
}

export interface IndicatorScores {
  currentRatio:           number
  debtToEquity:           number
  grossMargin:            number
  ebitdaMargin:           number
  interestCoverage:       number
  operatingCashFlowMargin:number
  revenueGrowth:          number | null // null when priorRevenue missing — weight redistributes
}

export type CreditTier = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

export interface ScoreResult {
  score:      number              // 0–100
  tier:       CreditTier
  indicators: IndicatorBreakdown
  scores:     IndicatorScores
  weights:    Record<keyof IndicatorScores, number>
}

const WEIGHTS_FULL: Record<keyof IndicatorScores, number> = {
  currentRatio:           15,
  debtToEquity:           20,
  grossMargin:            15,
  ebitdaMargin:           15,
  interestCoverage:       15,
  operatingCashFlowMargin:10,
  revenueGrowth:          10,
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (denominator === 0) return null
  return numerator / denominator
}

export function computeIndicators(items: FinancialLineItems): IndicatorBreakdown {
  return {
    currentRatio:            safeRatio(items.currentAssets, items.currentLiabilities),
    debtToEquity:            safeRatio(items.totalLiabilities, items.equity),
    grossMargin:             safeRatio(items.grossProfit, items.revenue),
    ebitdaMargin:            safeRatio(items.ebitda, items.revenue),
    interestCoverage:        safeRatio(items.ebitda, items.interestExpense),
    operatingCashFlowMargin: safeRatio(items.cashFromOperations, items.revenue),
    revenueGrowth:
      items.priorRevenue !== undefined && items.priorRevenue > 0
        ? (items.revenue - items.priorRevenue) / items.priorRevenue
        : null,
  }
}

/** Maps an indicator value to a 0–100 sub-score using bucketed thresholds. */
function scoreCurrentRatio(v: number | null): number {
  if (v === null) return 0
  if (v >= 2) return 100
  if (v >= 1.5) return 80
  if (v >= 1) return 60
  return 30
}
function scoreDebtToEquity(v: number | null): number {
  if (v === null) return 0
  if (v < 1) return 100
  if (v < 2) return 80
  if (v < 3) return 60
  return 30
}
function scoreGrossMargin(v: number | null): number {
  if (v === null) return 0
  if (v >= 0.4) return 100
  if (v >= 0.25) return 80
  if (v >= 0.10) return 60
  return 30
}
function scoreEbitdaMargin(v: number | null): number {
  if (v === null) return 0
  if (v >= 0.20) return 100
  if (v >= 0.10) return 80
  if (v >= 0.05) return 60
  return 30
}
function scoreInterestCoverage(v: number | null): number {
  if (v === null) return 0
  if (v >= 5) return 100
  if (v >= 3) return 80
  if (v >= 1.5) return 60
  return 30
}
function scoreOperatingCashFlowMargin(v: number | null): number {
  if (v === null) return 0
  if (v >= 0.15) return 100
  if (v >= 0.08) return 80
  if (v >= 0.03) return 60
  return 30
}
function scoreRevenueGrowth(v: number | null): number | null {
  if (v === null) return null // signal: redistribute weight
  if (v >= 0.20) return 100
  if (v >= 0.05) return 80
  if (v >= 0) return 60
  return 30
}

function tierFor(score: number): CreditTier {
  if (score >= 85) return 'EXCELLENT'
  if (score >= 70) return 'GOOD'
  if (score >= 55) return 'FAIR'
  return 'POOR'
}

export function indicatorsToScore(items: FinancialLineItems): ScoreResult {
  const indicators = computeIndicators(items)

  const scores: IndicatorScores = {
    currentRatio:            scoreCurrentRatio(indicators.currentRatio),
    debtToEquity:            scoreDebtToEquity(indicators.debtToEquity),
    grossMargin:             scoreGrossMargin(indicators.grossMargin),
    ebitdaMargin:            scoreEbitdaMargin(indicators.ebitdaMargin),
    interestCoverage:        scoreInterestCoverage(indicators.interestCoverage),
    operatingCashFlowMargin: scoreOperatingCashFlowMargin(indicators.operatingCashFlowMargin),
    revenueGrowth:           scoreRevenueGrowth(indicators.revenueGrowth),
  }

  // If revenue growth is missing, redistribute its weight proportionally.
  const weights = { ...WEIGHTS_FULL }
  if (scores.revenueGrowth === null) {
    const redistributable = WEIGHTS_FULL.revenueGrowth
    weights.revenueGrowth = 0
    const otherSum = Object.entries(weights)
      .filter(([k]) => k !== 'revenueGrowth')
      .reduce((s, [, w]) => s + w, 0)
    for (const k of Object.keys(weights) as Array<keyof IndicatorScores>) {
      if (k === 'revenueGrowth') continue
      weights[k] = weights[k] + (weights[k] / otherSum) * redistributable
    }
  }

  const weightedSum = (Object.keys(weights) as Array<keyof IndicatorScores>).reduce((sum, k) => {
    const sub = scores[k]
    if (sub === null) return sum
    return sum + (sub * weights[k]) / 100
  }, 0)

  const score = Math.round(Math.min(100, Math.max(0, weightedSum)))

  return {
    score,
    tier:       tierFor(score),
    indicators,
    scores,
    weights,
  }
}

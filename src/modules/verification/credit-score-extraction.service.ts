import { db } from '../../config/database'
import { logger } from '../../shared/logger'
import { BadRequestError } from '../../shared/errors'
import { storeDocument } from '../../shared/document-store'
import { extractFromPdf } from '../../shared/extraction.service'
import {
  indicatorsToScore,
  type FinancialLineItems,
} from '../../shared/credit-score-indicators'

import { CREDIT_BALANCE_SHEET_PROMPT }   from './prompts/credit-balance-sheet.prompt'
import { CREDIT_INCOME_STATEMENT_PROMPT } from './prompts/credit-income-statement.prompt'
import { CREDIT_CASH_FLOW_PROMPT }        from './prompts/credit-cash-flow.prompt'

import {
  balanceSheetExtractionSchema,
  incomeStatementExtractionSchema,
  cashFlowExtractionSchema,
} from './extraction-schemas/credit-score.schema'

/**
 * Credit Score custom flow (P4) — replaces the n8n POC (see KYB-CREDIT-SCORE-PLAN.md).
 *
 * Sync extraction in v1: upload → store → Claude → save → recompute preliminary
 * score → return. Mirrors `kyb-extraction.service.ts`. Behind env.KYB_CUSTOM_FLOW
 * (one flag gates the whole custom doc-extraction flow). Business accounts only.
 *
 * Hybrid scoring: the algorithm computes a preliminary `computedScore`/`computedTier`
 * from the extracted line items; the admin reviews and can override the final
 * `score`/`rating` via PUT /admin/credit-score-requests/:id/result.
 */

export type CreditDocType = 'balance_sheet' | 'income_statement' | 'cash_flow'

const DRAFT_STATUSES = ['DRAFT', 'EXTRACTING', 'READY_FOR_REVIEW', 'SCORE_COMPUTED'] as const

/**
 * Dispatches to the right (prompt, schema) pair for each docType. Done as a
 * switch so TypeScript narrows the schema's generic correctly — an indexed map
 * keeps the schema typed as a union and breaks `extractFromPdf<T>`'s inference.
 */
async function extractForDocType(docType: CreditDocType, pdfBuffer: Buffer) {
  switch (docType) {
    case 'balance_sheet':
      return extractFromPdf({
        pdfBuffer,
        schema:        balanceSheetExtractionSchema,
        systemPrompt:  CREDIT_BALANCE_SHEET_PROMPT.system,
        promptVersion: CREDIT_BALANCE_SHEET_PROMPT.version,
      })
    case 'income_statement':
      return extractFromPdf({
        pdfBuffer,
        schema:        incomeStatementExtractionSchema,
        systemPrompt:  CREDIT_INCOME_STATEMENT_PROMPT.system,
        promptVersion: CREDIT_INCOME_STATEMENT_PROMPT.version,
      })
    case 'cash_flow':
      return extractFromPdf({
        pdfBuffer,
        schema:        cashFlowExtractionSchema,
        systemPrompt:  CREDIT_CASH_FLOW_PROMPT.system,
        promptVersion: CREDIT_CASH_FLOW_PROMPT.version,
      })
  }
}

// Numeric line-item fields a user is allowed to PATCH. Anything else is dropped.
const LINE_ITEM_FIELDS = new Set<keyof FinancialLineItems>([
  'totalAssets', 'currentAssets', 'cash', 'inventory',
  'totalLiabilities', 'currentLiabilities', 'longTermDebt', 'equity',
  'revenue', 'cogs', 'grossProfit', 'opex', 'ebitda', 'netIncome', 'interestExpense',
  'cashFromOperations', 'cashFromInvesting', 'cashFromFinancing', 'netChangeInCash', 'freeCashFlow',
  'priorRevenue',
])

/** Coerce a stored partial line-item map into a complete FinancialLineItems (missing → 0). */
function toLineItems(raw: Record<string, unknown> | null | undefined): FinancialLineItems {
  const get = (k: string): number => {
    const v = raw?.[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  const priorRevenueRaw = raw?.priorRevenue
  const items: FinancialLineItems = {
    totalAssets: get('totalAssets'), currentAssets: get('currentAssets'), cash: get('cash'), inventory: get('inventory'),
    totalLiabilities: get('totalLiabilities'), currentLiabilities: get('currentLiabilities'),
    longTermDebt: get('longTermDebt'), equity: get('equity'),
    revenue: get('revenue'), cogs: get('cogs'), grossProfit: get('grossProfit'), opex: get('opex'),
    ebitda: get('ebitda'), netIncome: get('netIncome'), interestExpense: get('interestExpense'),
    cashFromOperations: get('cashFromOperations'), cashFromInvesting: get('cashFromInvesting'),
    cashFromFinancing: get('cashFromFinancing'), netChangeInCash: get('netChangeInCash'),
    freeCashFlow: get('freeCashFlow'),
  }
  if (typeof priorRevenueRaw === 'number' && priorRevenueRaw > 0) items.priorRevenue = priorRevenueRaw
  return items
}

/** Recompute preliminary score from a line-item map and persist it on the request. */
async function recomputeAndPersist(requestId: string, lineItems: Record<string, unknown>) {
  const result = indicatorsToScore(toLineItems(lineItems))
  await db.creditScoreRequest.update({
    where: { id: requestId },
    data: {
      extractedLineItems:  lineItems as unknown as object,
      extractedIndicators: result.indicators as unknown as object,
      computedScore:       result.score,
      computedTier:        result.tier,
    },
  })
  return result
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface UploadCreditDocumentInput {
  userId:   string
  docType:  CreditDocType
  buffer:   Buffer
  filename: string
  mimeType: string
  period?:  string
}

// ─── Public service functions ─────────────────────────────────────────────────

/**
 * Upload a financial statement, store encrypted, run Claude extraction
 * synchronously, merge the line items into the request, recompute the
 * preliminary score, and return the parsed data + confidence + computed score.
 */
export async function uploadAndExtractCreditDocument(input: UploadCreditDocumentInput) {
  const requestId = await getOrCreateDraft(input.userId, input.period)

  const stored = await storeDocument({
    userId:               input.userId,
    fieldName:            input.docType,
    filename:             input.filename,
    mimeType:             input.mimeType,
    content:              input.buffer,
    creditScoreRequestId: requestId,
  })

  const job = await db.documentExtraction.create({
    data: { documentId: stored.documentId, docType: input.docType, status: 'EXTRACTING', startedAt: new Date() },
    select: { id: true },
  })

  try {
    const result = await extractForDocType(input.docType, input.buffer)

    await db.documentExtraction.update({
      where: { id: job.id },
      data: {
        status:              'COMPLETED',
        modelName:           result.modelName,
        systemPromptVersion: result.promptVersion,
        rawResponse:         result.rawResponse,
        extractedData:       result.data as unknown as object,
        confidence:          result.confidence as unknown as object,
        promptTokens:        result.promptTokens,
        completionTokens:    result.completionTokens,
        completedAt:         new Date(),
      },
    })

    // Merge this statement's numeric line items into the running set, then recompute.
    const request = await db.creditScoreRequest.findUnique({
      where: { id: requestId },
      select: { extractedLineItems: true },
    })
    const merged: Record<string, unknown> = {
      ...((request?.extractedLineItems as Record<string, unknown> | null) ?? {}),
    }
    for (const [k, v] of Object.entries(result.data)) {
      if (LINE_ITEM_FIELDS.has(k as keyof FinancialLineItems) && typeof v === 'number') merged[k] = v
    }

    const computed = await recomputeAndPersist(requestId, merged)

    await db.creditScoreRequest.update({
      where: { id: requestId },
      data:  { status: 'READY_FOR_REVIEW' },
    })

    return {
      requestId,
      documentId:   stored.documentId,
      extractionId: job.id,
      docType:      input.docType,
      status:       'COMPLETED' as const,
      data:         result.data,
      confidence:   result.confidence,
      computed:     { score: computed.score, tier: computed.tier, indicators: computed.indicators },
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error({ extractionId: job.id, docType: input.docType, err: errorMessage }, 'credit_score.extraction_failed')
    await db.documentExtraction.update({
      where: { id: job.id },
      data:  { status: 'FAILED', errorMessage, completedAt: new Date() },
    })
    throw new BadRequestError(`Document extraction failed: ${errorMessage}`)
  }
}

/** Returns the current draft request + uploaded docs + latest extractions. */
export async function getMyCreditDraft(userId: string) {
  return db.creditScoreRequest.findFirst({
    where: { userId, status: { in: [...DRAFT_STATUSES] } },
    include: {
      documents: {
        select: {
          id: true, fieldName: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true,
          extractions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true, status: true, modelName: true, systemPromptVersion: true,
              extractedData: true, confidence: true, errorMessage: true, startedAt: true, completedAt: true,
            },
          },
        },
      },
    },
  })
}

/**
 * Apply user-corrected line items (and/or period) to a draft, recompute the
 * preliminary score, and return the fresh score breakdown.
 */
export async function patchCreditDraft(
  userId: string,
  requestId: string,
  patch: { lineItems?: Record<string, unknown>; period?: string },
) {
  const draft = await db.creditScoreRequest.findFirst({
    where:  { id: requestId, userId, status: { in: [...DRAFT_STATUSES] } },
    select: { id: true, extractedLineItems: true },
  })
  if (!draft) throw new BadRequestError('No active draft credit-score request for this user.')

  if (patch.period) {
    await db.creditScoreRequest.update({ where: { id: draft.id }, data: { period: patch.period } })
  }

  const merged: Record<string, unknown> = {
    ...((draft.extractedLineItems as Record<string, unknown> | null) ?? {}),
  }
  if (patch.lineItems) {
    for (const [k, v] of Object.entries(patch.lineItems)) {
      if (!LINE_ITEM_FIELDS.has(k as keyof FinancialLineItems)) continue
      if (v === null || v === '') { delete merged[k]; continue }
      const num = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(num)) merged[k] = num
    }
  }

  const computed = await recomputeAndPersist(draft.id, merged)
  return {
    requestId:  draft.id,
    lineItems:  merged,
    indicators: computed.indicators,
    score:      computed.score,
    tier:       computed.tier,
  }
}

/** Finalise the draft → PENDING (admin review queue), with the preliminary score baked in. */
export async function submitCreditDraft(userId: string, requestId: string) {
  const draft = await db.creditScoreRequest.findFirst({
    where:  { id: requestId, userId, status: { in: [...DRAFT_STATUSES] } },
    select: { id: true, computedScore: true, extractedLineItems: true },
  })
  if (!draft) throw new BadRequestError('No draft credit-score request ready to submit.')

  const items = (draft.extractedLineItems as Record<string, unknown> | null) ?? {}
  if (typeof items.revenue !== 'number' || items.revenue <= 0) {
    throw new BadRequestError('Cannot submit: revenue is required to compute a score.')
  }
  if (draft.computedScore == null) {
    throw new BadRequestError('Cannot submit: no preliminary score computed yet.')
  }

  return db.creditScoreRequest.update({
    where: { id: draft.id },
    data:  { status: 'PENDING', submittedToN8nAt: null },
  })
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getOrCreateDraft(userId: string, period?: string): Promise<string> {
  const existing = await db.creditScoreRequest.findFirst({
    where:  { userId, status: { in: [...DRAFT_STATUSES] } },
    select: { id: true },
  })
  if (existing) {
    if (period) await db.creditScoreRequest.update({ where: { id: existing.id }, data: { period } })
    return existing.id
  }

  const created = await db.creditScoreRequest.create({
    data: { userId, status: 'DRAFT', period: period ?? null, extractionVersion: 'v1' },
    select: { id: true },
  })
  return created.id
}

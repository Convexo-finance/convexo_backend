import { db } from '../../config/database'
import { logger } from '../../shared/logger'
import { BadRequestError } from '../../shared/errors'
import { createUploadIntent, confirmUpload, type UploadIntentBody } from '../../shared/document-store'
import { extractFromPdf } from '../../shared/extraction.service'

import { KYB_INCORPORATION_PROMPT } from './prompts/kyb-incorporation.prompt'
import { KYB_ARTICLES_PROMPT }      from './prompts/kyb-articles.prompt'
import { KYB_SHAREHOLDERS_PROMPT }  from './prompts/kyb-shareholders.prompt'

import {
  incorporationExtractionSchema,
  articlesExtractionSchema,
  shareholdersExtractionSchema,
} from './extraction-schemas/kyb.schema'

/**
 * KYB custom flow — replaces Sumsub (see KYB-CREDIT-SCORE-PLAN.md).
 *
 * Upload is direct-to-Supabase-Storage (Vercel caps request bodies at 4.5 MB):
 *   upload-url → browser PUTs to Storage → confirm (verify + Claude + save → return).
 * Extraction stays synchronous in confirm; the frontend shows a spinner for 5-30s
 * per doc. v2 moves this to a queue.
 *
 * Behind env.KYB_CUSTOM_FLOW — routes enforce the gate.
 */

export type KybDocType = 'incorporation' | 'articles' | 'shareholders'

/**
 * Dispatches to the right (prompt, schema) pair for each docType.
 * Done as a switch so TypeScript narrows the schema's generic correctly
 * — an indexed map keeps the schema typed as a union and breaks
 * `extractFromPdf<T>`'s inference.
 */
async function extractForDocType(docType: KybDocType, pdfBuffer: Buffer) {
  switch (docType) {
    case 'incorporation':
      return extractFromPdf({
        pdfBuffer,
        schema:        incorporationExtractionSchema,
        systemPrompt:  KYB_INCORPORATION_PROMPT.system,
        promptVersion: KYB_INCORPORATION_PROMPT.version,
      })
    case 'articles':
      return extractFromPdf({
        pdfBuffer,
        schema:        articlesExtractionSchema,
        systemPrompt:  KYB_ARTICLES_PROMPT.system,
        promptVersion: KYB_ARTICLES_PROMPT.version,
      })
    case 'shareholders':
      return extractFromPdf({
        pdfBuffer,
        schema:        shareholdersExtractionSchema,
        systemPrompt:  KYB_SHAREHOLDERS_PROMPT.system,
        promptVersion: KYB_SHAREHOLDERS_PROMPT.version,
      })
  }
}

// Fields a user is allowed to PATCH on a DRAFT. Anything else is dropped.
const EDITABLE_FIELDS = new Set<string>([
  'companyName', 'country', 'companyType', 'incorporationNumber', 'taxNumber',
  'street', 'city', 'stateRegion', 'officeCountry',
  'repFirstName', 'repLastName', 'repDocType', 'repDocNumber', 'repEmail', 'repPhone',
  'shareholders', 'governance', 'extractedData', 'extractionVersion',
  'controllerFirstName', 'controllerLastName', 'controllerEmail', 'controllerPhone',
  'controllerRelationship', 'controllerWallet',
])

// ─── Public service functions ─────────────────────────────────────────────────

/**
 * Step 1 — get-or-create the DRAFT and issue a signed upload URL for one PDF.
 */
export async function createKybUploadIntent(userId: string, docType: KybDocType, body: UploadIntentBody) {
  const submissionId = await getOrCreateDraft(userId)
  const intent = await createUploadIntent({
    userId,
    purpose:   'kyb',
    fieldName: docType,
    parent:    { kybSubmissionId: submissionId },
    ...body,
  })
  return { submissionId, docType, ...intent }
}

/**
 * Step 2 — after the browser PUT: verify the stored object, run Claude extraction
 * synchronously, persist the result on a DocumentExtraction row, and return the
 * parsed data + confidence map so the caller can pre-fill the form. Calling it
 * again for the same document re-runs extraction (retry after a failure).
 */
export async function confirmAndExtractKybDocument(userId: string, documentId: string) {
  const doc = await confirmUpload(userId, documentId, 'kyb')
  const docType = doc.fieldName as KybDocType

  const draft = doc.kybSubmissionId
    ? await db.kybSubmission.findFirst({
        where:  { id: doc.kybSubmissionId, userId, status: { in: ['DRAFT', 'EXTRACTING', 'READY_FOR_REVIEW'] } },
        select: { id: true },
      })
    : null
  if (!draft) throw new BadRequestError('This document is not attached to an active KYB draft.')
  const draftId = draft.id

  // Insert DocumentExtraction row in EXTRACTING state (state-before-side-effect)
  const job = await db.documentExtraction.create({
    data: {
      documentId: doc.documentId,
      docType,
      status:     'EXTRACTING',
      startedAt:  new Date(),
    },
    select: { id: true },
  })

  // Call Claude (discriminated dispatch keeps types narrow)
  try {
    const result = await extractForDocType(docType, doc.buffer)

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

    // Promote DRAFT → READY_FOR_REVIEW once at least one doc is COMPLETED.
    // Submission stays in READY_FOR_REVIEW until user explicitly submits.
    await db.kybSubmission.update({
      where: { id: draftId },
      data:  { status: 'READY_FOR_REVIEW' },
    })

    return {
      submissionId: draftId,
      documentId:   doc.documentId,
      extractionId: job.id,
      docType,
      status:       'COMPLETED' as const,
      data:         result.data,
      confidence:   result.confidence,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error(
      { extractionId: job.id, docType, err: errorMessage },
      'kyb.extraction_failed',
    )
    await db.documentExtraction.update({
      where: { id: job.id },
      data:  { status: 'FAILED', errorMessage, completedAt: new Date() },
    })
    throw new BadRequestError(`Document extraction failed: ${errorMessage}`)
  }
}

/** Returns the current DRAFT (or READY_FOR_REVIEW) + uploaded docs + latest extractions. */
export async function getMyKybDraft(userId: string) {
  return db.kybSubmission.findFirst({
    where: {
      userId,
      status: { in: ['DRAFT', 'EXTRACTING', 'READY_FOR_REVIEW'] },
    },
    include: {
      documents: {
        where:  { status: 'UPLOADED' },
        select: {
          id:        true,
          fieldName: true,
          filename:  true,
          mimeType:  true,
          sizeBytes: true,
          createdAt: true,
          extractions: {
            orderBy: { createdAt: 'desc' },
            take:    1,
            select: {
              id:                  true,
              status:              true,
              modelName:           true,
              systemPromptVersion: true,
              extractedData:       true,
              confidence:          true,
              errorMessage:        true,
              startedAt:           true,
              completedAt:         true,
            },
          },
        },
      },
    },
  })
}

/** Apply user-corrected values to a DRAFT. Unknown fields are silently dropped. */
export async function patchKybDraft(
  userId: string,
  draftId: string,
  patch: Record<string, unknown>,
) {
  const draft = await db.kybSubmission.findFirst({
    where:  { id: draftId, userId, status: { in: ['DRAFT', 'EXTRACTING', 'READY_FOR_REVIEW'] } },
    select: { id: true },
  })
  if (!draft) throw new BadRequestError('No active DRAFT submission for this user.')

  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (EDITABLE_FIELDS.has(k)) data[k] = v
  }
  if (Object.keys(data).length === 0) {
    throw new BadRequestError('No editable fields in patch payload.')
  }

  return db.kybSubmission.update({
    where: { id: draft.id },
    data,
  })
}

/** Finalise the draft → PENDING (admin review queue). */
export async function submitKybDraft(userId: string, draftId: string) {
  const draft = await db.kybSubmission.findFirst({
    where:  { id: draftId, userId, status: { in: ['DRAFT', 'READY_FOR_REVIEW'] } },
    select: {
      id:               true,
      companyName:      true,
      taxNumber:        true,
      repEmail:         true,
      controllerWallet: true,
    },
  })
  if (!draft) throw new BadRequestError('No DRAFT submission ready to submit.')

  const missing: string[] = []
  if (!draft.companyName)      missing.push('companyName')
  if (!draft.taxNumber)        missing.push('taxNumber')
  if (!draft.repEmail)         missing.push('repEmail')
  if (!draft.controllerWallet) missing.push('controllerWallet')
  if (missing.length > 0) {
    throw new BadRequestError(`Cannot submit: missing required fields: ${missing.join(', ')}`)
  }

  return db.kybSubmission.update({
    where: { id: draft.id },
    data:  { status: 'PENDING' },
  })
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getOrCreateDraft(userId: string): Promise<string> {
  const existing = await db.kybSubmission.findFirst({
    where:  { userId, status: { in: ['DRAFT', 'EXTRACTING', 'READY_FOR_REVIEW'] } },
    select: { id: true },
  })
  if (existing) return existing.id

  // KybSubmission requires non-null strings for many columns. Initial DRAFT
  // is filled with empty strings; submitKybDraft enforces non-empty before
  // promoting to PENDING.
  const created = await db.kybSubmission.create({
    data: {
      userId,
      companyName:         '',
      country:             '',
      companyType:         '',
      incorporationNumber: '',
      taxNumber:           '',
      street:              '',
      city:                '',
      officeCountry:       '',
      repFirstName:        '',
      repLastName:         '',
      repDocType:          '',
      repDocNumber:        '',
      repEmail:            '',
      repPhone:            '',
      shareholders:        [],
      status:              'DRAFT',
      extractionVersion:   'v1',
    },
    select: { id: true },
  })
  return created.id
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env'
import { requireAuth } from '../../middleware/requireAuth'
import { requireBusiness } from '../../middleware/requireAccountType'
import { ForbiddenError } from '../../shared/errors'
import { uploadIntentBodySchema, documentIdParamsSchema } from '../../shared/document-store'
import {
  createCreditUploadIntent,
  confirmAndExtractCreditDocument,
  getMyCreditDraft,
  patchCreditDraft,
  submitCreditDraft,
  type CreditDocType,
} from './credit-score-extraction.service'

const docTypeSchema = z.enum(['balance_sheet', 'income_statement', 'cash_flow'])
const uploadUrlBody = uploadIntentBodySchema.extend({
  docType: docTypeSchema,
  period:  z.string().trim().min(1).max(32).optional(),
})
const draftIdParams = z.object({ id: z.string().min(1) })
const patchBody = z.object({
  lineItems: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
  period:    z.string().min(1).optional(),
})

/**
 * All routes gated by `env.KYB_CUSTOM_FLOW` (one flag for the whole custom
 * doc-extraction flow). When off, every route returns 403. Wired in app.ts
 * unconditionally so the flag can be flipped in Vercel without a redeploy.
 */
function requireFeatureFlag(): void {
  if (!env.KYB_CUSTOM_FLOW) {
    throw new ForbiddenError('Custom credit-score flow is not enabled in this environment.')
  }
}

export async function creditScoreExtractionRoutes(app: FastifyInstance) {
  // ─── POST /verification/credit-score/upload-url ─────────────────────────────
  // Step 1 of the direct-to-Storage upload (files never transit this API).
  app.post('/verification/credit-score/upload-url', {
    preHandler: [requireAuth, requireBusiness],
    schema: {
      tags:    ['Verification'],
      summary: 'Create a signed Supabase Storage upload URL for a financial statement PDF (custom flow v1)',
    },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const { docType, period, ...body } = uploadUrlBody.parse(request.body)
      const intent = await createCreditUploadIntent(request.user.sub, docType as CreditDocType, body, period)
      return reply.status(201).send(intent)
    },
  })

  // ─── POST /verification/credit-score/documents/:documentId/confirm ──────────
  app.post('/verification/credit-score/documents/:documentId/confirm', {
    preHandler: [requireAuth, requireBusiness],
    schema: {
      tags:    ['Verification'],
      summary: 'Confirm an uploaded statement, extract line items via Claude, recompute score (custom flow v1)',
    },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const { documentId } = documentIdParamsSchema.parse(request.params)
      const result = await confirmAndExtractCreditDocument(request.user.sub, documentId)
      return reply.send(result)
    },
  })

  // ─── GET /verification/credit-score/draft ───────────────────────────────────
  app.get('/verification/credit-score/draft', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Get the current credit-score draft (custom flow v1)' },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const draft = await getMyCreditDraft(request.user.sub)
      return reply.send({ draft })
    },
  })

  // ─── PATCH /verification/credit-score/draft/:id ─────────────────────────────
  app.patch('/verification/credit-score/draft/:id', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Patch line items + recompute preliminary score (custom flow v1)' },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const { id } = draftIdParams.parse(request.params)
      const patch  = patchBody.parse(request.body)
      const result = await patchCreditDraft(request.user.sub, id, patch)
      return reply.send(result)
    },
  })

  // ─── POST /verification/credit-score/draft/:id/submit ───────────────────────
  app.post('/verification/credit-score/draft/:id/submit', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Submit a credit-score draft for admin review (custom flow v1)' },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const { id } = draftIdParams.parse(request.params)
      const finalised = await submitCreditDraft(request.user.sub, id)
      return reply.send({ request: finalised })
    },
  })
}

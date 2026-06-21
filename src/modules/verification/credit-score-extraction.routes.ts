import type { FastifyInstance } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { z } from 'zod'
import { env } from '../../config/env'
import { requireAuth } from '../../middleware/requireAuth'
import { requireBusiness } from '../../middleware/requireAccountType'
import { BadRequestError, ForbiddenError } from '../../shared/errors'
import {
  uploadAndExtractCreditDocument,
  getMyCreditDraft,
  patchCreditDraft,
  submitCreditDraft,
  type CreditDocType,
} from './credit-score-extraction.service'

const docTypeSchema = z.enum(['balance_sheet', 'income_statement', 'cash_flow'])
const draftIdParams = z.object({ id: z.string().min(1) })
const patchBody = z.object({
  lineItems: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
  period:    z.string().min(1).optional(),
})

/**
 * All routes gated by `env.KYB_CUSTOM_FLOW` (one flag for the whole custom
 * doc-extraction flow). When off, every route returns 403. Wired in app.ts
 * unconditionally so the flag can be flipped in Railway without a redeploy.
 */
function requireFeatureFlag(): void {
  if (!env.KYB_CUSTOM_FLOW) {
    throw new ForbiddenError('Custom credit-score flow is not enabled in this environment.')
  }
}

export async function creditScoreExtractionRoutes(app: FastifyInstance) {
  // ─── POST /verification/credit-score/upload ─────────────────────────────────
  app.post('/verification/credit-score/upload', {
    preHandler: [requireAuth, requireBusiness],
    schema: {
      tags:     ['Verification'],
      summary:  'Upload a financial statement and extract line items via Claude (custom flow v1)',
      consumes: ['multipart/form-data'],
    },
    handler: async (request, reply) => {
      requireFeatureFlag()

      const userId = request.user.sub
      const parts  = request.parts()

      let docTypeRaw: string | undefined
      let periodRaw: string | undefined
      let file: MultipartFile | undefined

      for await (const part of parts) {
        if (part.type === 'file') {
          if (!file) file = part as MultipartFile
        } else if (part.fieldname === 'docType' && typeof part.value === 'string') {
          docTypeRaw = part.value
        } else if (part.fieldname === 'period' && typeof part.value === 'string') {
          periodRaw = part.value
        }
      }

      if (!file)       throw new BadRequestError('Missing PDF upload.')
      if (!docTypeRaw) throw new BadRequestError('Missing docType field.')

      const docType = docTypeSchema.parse(docTypeRaw) as CreditDocType

      const chunks: Buffer[] = []
      for await (const chunk of file.file) chunks.push(chunk)
      const buffer = Buffer.concat(chunks)

      const result = await uploadAndExtractCreditDocument({
        userId,
        docType,
        buffer,
        filename: file.filename,
        mimeType: file.mimetype,
        period:   periodRaw,
      })

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

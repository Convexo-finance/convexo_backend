import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env'
import { requireAuth } from '../../middleware/requireAuth'
import { requireBusiness } from '../../middleware/requireAccountType'
import { ForbiddenError } from '../../shared/errors'
import { uploadIntentBodySchema, documentIdParamsSchema } from '../../shared/document-store'
import {
  createKybUploadIntent,
  confirmAndExtractKybDocument,
  getMyKybDraft,
  patchKybDraft,
  submitKybDraft,
  type KybDocType,
} from './kyb-extraction.service'

const docTypeSchema = z.enum(['incorporation', 'articles', 'shareholders'])
const uploadUrlBody = uploadIntentBodySchema.extend({ docType: docTypeSchema })
const draftIdParams = z.object({ id: z.string().min(1) })
const patchBody     = z.record(z.string(), z.unknown())

/**
 * All routes in this file are gated by `env.KYB_CUSTOM_FLOW`. When off, every
 * route returns 403. Wiring them in app.ts unconditionally so we can flip the
 * flag in Railway without a redeploy when the frontend is ready.
 */
function requireFeatureFlag(): void {
  if (!env.KYB_CUSTOM_FLOW) {
    throw new ForbiddenError('KYB custom flow is not enabled in this environment.')
  }
}

export async function kybExtractionRoutes(app: FastifyInstance) {
  // ─── POST /verification/kyb/upload-url ──────────────────────────────────────
  // Step 1 of the direct-to-Storage upload. Returns a signed upload URL; the
  // browser PUTs the PDF to Supabase Storage (never through this API — Vercel
  // caps request bodies at 4.5 MB).
  app.post('/verification/kyb/upload-url', {
    preHandler: [requireAuth, requireBusiness],
    schema: {
      tags:    ['Verification'],
      summary: 'Create a signed Supabase Storage upload URL for a KYB PDF (custom flow v1)',
    },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const { docType, ...body } = uploadUrlBody.parse(request.body)
      const intent = await createKybUploadIntent(request.user.sub, docType as KybDocType, body)
      return reply.status(201).send(intent)
    },
  })

  // ─── POST /verification/kyb/documents/:documentId/confirm ───────────────────
  // Step 2: verify the stored object, run Claude extraction, return pre-fill data.
  app.post('/verification/kyb/documents/:documentId/confirm', {
    preHandler: [requireAuth, requireBusiness],
    schema: {
      tags:    ['Verification'],
      summary: 'Confirm an uploaded KYB PDF and extract fields via Claude (custom flow v1)',
    },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const { documentId } = documentIdParamsSchema.parse(request.params)
      const result = await confirmAndExtractKybDocument(request.user.sub, documentId)
      return reply.send(result)
    },
  })

  // ─── GET /verification/kyb/draft ────────────────────────────────────────────
  app.get('/verification/kyb/draft', {
    preHandler: [requireAuth, requireBusiness],
    schema: {
      tags:    ['Verification'],
      summary: 'Get the current KYB draft for this user (custom flow v1)',
    },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const draft = await getMyKybDraft(request.user.sub)
      return reply.send({ draft })
    },
  })

  // ─── PATCH /verification/kyb/draft/:id ──────────────────────────────────────
  app.patch('/verification/kyb/draft/:id', {
    preHandler: [requireAuth, requireBusiness],
    schema: {
      tags:    ['Verification'],
      summary: 'Patch KYB draft fields with user-corrected values (custom flow v1)',
    },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const { id } = draftIdParams.parse(request.params)
      const patch  = patchBody.parse(request.body)
      const updated = await patchKybDraft(request.user.sub, id, patch)
      return reply.send({ submission: updated })
    },
  })

  // ─── POST /verification/kyb/draft/:id/submit ────────────────────────────────
  app.post('/verification/kyb/draft/:id/submit', {
    preHandler: [requireAuth, requireBusiness],
    schema: {
      tags:    ['Verification'],
      summary: 'Submit a KYB draft for admin review (custom flow v1)',
    },
    handler: async (request, reply) => {
      requireFeatureFlag()
      const { id } = draftIdParams.parse(request.params)
      const finalised = await submitKybDraft(request.user.sub, id)
      return reply.send({ submission: finalised })
    },
  })
}

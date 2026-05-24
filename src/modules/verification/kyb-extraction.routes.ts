import type { FastifyInstance } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { z } from 'zod'
import { env } from '../../config/env'
import { requireAuth } from '../../middleware/requireAuth'
import { requireBusiness } from '../../middleware/requireAccountType'
import { BadRequestError, ForbiddenError } from '../../shared/errors'
import {
  uploadAndExtractKybDocument,
  getMyKybDraft,
  patchKybDraft,
  submitKybDraft,
  type KybDocType,
} from './kyb-extraction.service'

const docTypeSchema = z.enum(['incorporation', 'articles', 'shareholders'])
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
  // ─── POST /verification/kyb/upload ──────────────────────────────────────────
  app.post('/verification/kyb/upload', {
    preHandler: [requireAuth, requireBusiness],
    schema: {
      tags:     ['Verification'],
      summary:  'Upload a KYB document and extract fields via Claude (custom flow v1)',
      consumes: ['multipart/form-data'],
    },
    handler: async (request, reply) => {
      requireFeatureFlag()

      const userId = request.user.sub
      const parts  = request.parts()

      let docTypeRaw: string | undefined
      let file: MultipartFile | undefined

      for await (const part of parts) {
        if (part.type === 'file') {
          // Capture only the first file; ignore extras.
          if (!file) file = part as MultipartFile
        } else if (part.fieldname === 'docType' && typeof part.value === 'string') {
          docTypeRaw = part.value
        }
      }

      if (!file)      throw new BadRequestError('Missing PDF upload.')
      if (!docTypeRaw) throw new BadRequestError('Missing docType field.')

      const docType = docTypeSchema.parse(docTypeRaw) as KybDocType

      const chunks: Buffer[] = []
      for await (const chunk of file.file) chunks.push(chunk)
      const buffer = Buffer.concat(chunks)

      const result = await uploadAndExtractKybDocument({
        userId,
        docType,
        buffer,
        filename: file.filename,
        mimeType: file.mimetype,
      })

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

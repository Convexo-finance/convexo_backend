import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import multipartPlugin from '../../plugins/multipart'
import { upload, list, getOne, remove } from './documents.controller'

export async function documentsRoutes(app: FastifyInstance) {
  // Scoped: multipart parsing exists only in this (public IPFS documents) context.
  await app.register(multipartPlugin)

  app.post('/documents', {
    preHandler: [requireAuth],
    schema: { tags: ['Documents'], summary: 'Upload a public document to IPFS (multipart/form-data, max 4 MB)' },
    handler: upload,
  })

  app.get('/documents', {
    preHandler: [requireAuth],
    schema: { tags: ['Documents'], summary: 'List my documents (filterable by category)' },
    handler: list,
  })

  app.get('/documents/:id', {
    preHandler: [requireAuth],
    schema: { tags: ['Documents'], summary: 'Get a single document' },
    handler: getOne,
  })

  app.delete('/documents/:id', {
    preHandler: [requireAuth],
    schema: { tags: ['Documents'], summary: 'Delete a document record (IPFS content remains immutable)' },
    handler: remove,
  })
}

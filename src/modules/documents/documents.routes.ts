import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { upload, list, getOne, remove } from './documents.controller'

export async function documentsRoutes(app: FastifyInstance) {
  app.post('/documents', {
    preHandler: [requireAuth],
    schema: { tags: ['Documents'], summary: 'Upload a document to IPFS (multipart/form-data)' },
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

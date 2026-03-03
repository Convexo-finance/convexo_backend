import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { requireBusiness } from '../../middleware/requireAccountType'
import { requireAdmin } from '../../middleware/requireAdmin'
import { create, listMine, getMine, listAll, review } from './funding.controller'

export async function fundingRoutes(app: FastifyInstance) {
  // ─── Business user ────────────────────────────────────────────────────────────
  app.post('/funding/requests', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Funding'], summary: 'Submit a funding request (Business only)' },
    handler: create,
  })

  app.get('/funding/requests', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Funding'], summary: 'List my funding requests' },
    handler: listMine,
  })

  app.get('/funding/requests/:id', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Funding'], summary: 'Get a single funding request' },
    handler: getMine,
  })

  // ─── Admin ────────────────────────────────────────────────────────────────────
  app.get('/admin/funding/requests', {
    preHandler: [requireAuth, requireAdmin('VIEWER')],
    schema: { tags: ['Admin — Funding'], summary: 'List all funding requests' },
    handler: listAll,
  })

  app.put('/admin/funding/requests/:id/review', {
    preHandler: [requireAuth, requireAdmin('VERIFIER')],
    schema: { tags: ['Admin — Funding'], summary: 'Review a funding request (approve/reject)' },
    handler: review,
  })
}

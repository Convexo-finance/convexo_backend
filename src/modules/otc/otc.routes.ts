import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { requireAdmin } from '../../middleware/requireAdmin'
import { create, listMine, getMine, listAll, updateStatus } from './otc.controller'

export async function otcRoutes(app: FastifyInstance) {
  // ─── User ────────────────────────────────────────────────────────────────────
  app.post('/otc/orders', {
    preHandler: [requireAuth],
    schema: { tags: ['OTC'], summary: 'Submit a new OTC order' },
    handler: create,
  })

  app.get('/otc/orders', {
    preHandler: [requireAuth],
    schema: { tags: ['OTC'], summary: 'List my OTC orders' },
    handler: listMine,
  })

  app.get('/otc/orders/:id', {
    preHandler: [requireAuth],
    schema: { tags: ['OTC'], summary: 'Get a single OTC order' },
    handler: getMine,
  })

  // ─── Admin ────────────────────────────────────────────────────────────────────
  app.get('/admin/otc/orders', {
    preHandler: [requireAuth, requireAdmin('VIEWER')],
    schema: { tags: ['Admin — OTC'], summary: 'List all OTC orders' },
    handler: listAll,
  })

  app.put('/admin/otc/orders/:id/status', {
    preHandler: [requireAuth, requireAdmin('VERIFIER')],
    schema: { tags: ['Admin — OTC'], summary: 'Update OTC order status' },
    handler: updateStatus,
  })
}

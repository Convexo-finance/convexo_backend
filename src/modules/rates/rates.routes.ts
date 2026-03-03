import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { requireAdmin } from '../../middleware/requireAdmin'
import { list, getOne, upsert, remove } from './rates.controller'

export async function ratesRoutes(app: FastifyInstance) {
  // ─── Public ──────────────────────────────────────────────────────────────────
  app.get('/rates', {
    schema: { tags: ['Rates'], summary: 'List all configured exchange rates' },
    handler: list,
  })

  app.get('/rates/:pair', {
    schema: { tags: ['Rates'], summary: 'Get rate for a specific pair (e.g. USD-COP)' },
    handler: getOne,
  })

  // ─── Admin ────────────────────────────────────────────────────────────────────
  // VERIFIER+ can set/delete rates
  app.post('/admin/rates', {
    preHandler: [requireAuth, requireAdmin('VERIFIER')],
    schema: { tags: ['Admin — Rates'], summary: 'Create or update an exchange rate' },
    handler: upsert,
  })

  app.delete('/admin/rates/:pair', {
    preHandler: [requireAuth, requireAdmin('VERIFIER')],
    schema: { tags: ['Admin — Rates'], summary: 'Delete an exchange rate pair' },
    handler: remove,
  })
}

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { requireAdmin } from '../../middleware/requireAdmin'
import { list, getOne, register } from './vault.controller'

export async function vaultRoutes(app: FastifyInstance) {
  // ─── Public (authenticated LP holders) ───────────────────────────────────────
  app.get('/vaults', {
    preHandler: [requireAuth],
    schema: { tags: ['Vaults'], summary: 'List all tokenized bond vaults' },
    handler: list,
  })

  app.get('/vaults/:address', {
    preHandler: [requireAuth],
    schema: { tags: ['Vaults'], summary: 'Get vault by on-chain address' },
    handler: getOne,
  })

  // ─── Admin — register after on-chain deployment ───────────────────────────────
  app.post('/admin/vaults', {
    preHandler: [requireAuth, requireAdmin('VERIFIER')],
    schema: { tags: ['Admin — Vaults'], summary: 'Register an on-chain vault in the DB' },
    handler: register,
  })
}

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { requireAdmin } from '../../middleware/requireAdmin'
import {
  listUsersHandler,
  getUserHandler,
  grantRoleHandler,
  revokeRoleHandler,
  listVerificationsHandler,
  overrideVerificationHandler,
  recordVerificationNftHandler,
  listCreditScoreRequestsHandler,
  overrideCreditScoreHandler,
  recordCreditScoreNftHandler,
} from './admin.controller'

export async function adminRoutes(app: FastifyInstance) {
  const viewer    = [requireAuth, requireAdmin('VIEWER')]
  const verifier  = [requireAuth, requireAdmin('VERIFIER')]
  const superAdmin = [requireAuth, requireAdmin('SUPER_ADMIN')]

  // ─── Users ──────────────────────────────────────────────────────────────────
  app.get('/admin/users', {
    preHandler: viewer,
    schema: { tags: ['Admin — Users'], summary: 'List all users (searchable)' },
    handler: listUsersHandler,
  })

  app.get('/admin/users/:id', {
    preHandler: viewer,
    schema: { tags: ['Admin — Users'], summary: 'Get full user details' },
    handler: getUserHandler,
  })

  // ─── Admin Roles ────────────────────────────────────────────────────────────
  app.post('/admin/roles', {
    preHandler: superAdmin,
    schema: { tags: ['Admin — Roles'], summary: 'Grant admin role to a user' },
    handler: grantRoleHandler,
  })

  app.delete('/admin/roles/:userId', {
    preHandler: superAdmin,
    schema: { tags: ['Admin — Roles'], summary: 'Revoke admin role from a user' },
    handler: revokeRoleHandler,
  })

  // ─── Verifications ──────────────────────────────────────────────────────────
  app.get('/admin/verifications', {
    preHandler: viewer,
    schema: { tags: ['Admin — Verifications'], summary: 'List all verifications (filter by type/status)' },
    handler: listVerificationsHandler,
  })

  app.put('/admin/verifications/:id/status', {
    preHandler: verifier,
    schema: { tags: ['Admin — Verifications'], summary: 'Manually override a verification status' },
    handler: overrideVerificationHandler,
  })

  app.put('/admin/verifications/:id/nft', {
    preHandler: verifier,
    schema: { tags: ['Admin — Verifications'], summary: 'Record NFT token ID for a verification' },
    handler: recordVerificationNftHandler,
  })

  // ─── Credit Score ────────────────────────────────────────────────────────────
  app.get('/admin/credit-score-requests', {
    preHandler: viewer,
    schema: { tags: ['Admin — Credit Score'], summary: 'List all credit score requests' },
    handler: listCreditScoreRequestsHandler,
  })

  app.put('/admin/credit-score-requests/:id/result', {
    preHandler: verifier,
    schema: { tags: ['Admin — Credit Score'], summary: 'Manually set credit score result' },
    handler: overrideCreditScoreHandler,
  })

  app.put('/admin/credit-score-requests/:id/nft', {
    preHandler: verifier,
    schema: { tags: ['Admin — Credit Score'], summary: 'Record NFT token ID for credit score' },
    handler: recordCreditScoreNftHandler,
  })
}

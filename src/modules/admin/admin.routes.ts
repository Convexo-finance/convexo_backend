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
  listKybHandler,
  getKybHandler,
  reviewKybHandler,
  listKycHandler,
  getKycHandler,
  reviewKycHandler,
  downloadDocumentHandler,
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

  // ─── KYB Submissions ─────────────────────────────────────────────────────────
  app.get('/admin/kyb/submissions', {
    preHandler: viewer,
    schema: { tags: ['Admin — KYB'], summary: 'List all KYB submissions' },
    handler: listKybHandler,
  })

  app.get('/admin/kyb/submissions/:id', {
    preHandler: viewer,
    schema: { tags: ['Admin — KYB'], summary: 'Get KYB submission details + document list' },
    handler: getKybHandler,
  })

  app.patch('/admin/kyb/submissions/:id/status', {
    preHandler: verifier,
    schema: { tags: ['Admin — KYB'], summary: 'Approve or reject a KYB submission' },
    handler: reviewKybHandler,
  })

  // ─── KYC Submissions ─────────────────────────────────────────────────────────
  app.get('/admin/kyc/submissions', {
    preHandler: viewer,
    schema: { tags: ['Admin — KYC'], summary: 'List all KYC submissions' },
    handler: listKycHandler,
  })

  app.get('/admin/kyc/submissions/:id', {
    preHandler: viewer,
    schema: { tags: ['Admin — KYC'], summary: 'Get KYC submission details + document list' },
    handler: getKycHandler,
  })

  app.patch('/admin/kyc/submissions/:id/status', {
    preHandler: verifier,
    schema: { tags: ['Admin — KYC'], summary: 'Approve or reject a KYC submission' },
    handler: reviewKycHandler,
  })

  // ─── Document download (works for both KYB and KYC) ──────────────────────────
  app.get('/admin/submissions/documents/:docId', {
    preHandler: viewer,
    schema: { tags: ['Admin — KYB'], summary: 'Download a submission document (streams the file)' },
    handler: downloadDocumentHandler,
  })
}

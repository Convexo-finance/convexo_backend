import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { requireIndividual, requireBusiness } from '../../middleware/requireAccountType'
import {
  getStatus,
  startKyc,
  getKycStatusHandler,
  startKyb,
  getKybStatusHandler,
  submitCreditScoreHandler,
  getCreditScoreStatusHandler,
} from './verification.controller'

export async function verificationRoutes(app: FastifyInstance) {
  // ─── All verifications status ────────────────────────────────────────────────
  app.get('/verification/status', {
    preHandler: [requireAuth],
    schema: { tags: ['Verification'], summary: 'Get all verification statuses for the current user' },
    handler: getStatus,
  })

  // ─── KYC — Individual ────────────────────────────────────────────────────────
  app.post('/verification/kyc/start', {
    preHandler: [requireAuth, requireIndividual],
    schema: { tags: ['Verification'], summary: 'Start KYC verification via Veriff (individuals)' },
    handler: startKyc,
  })

  app.get('/verification/kyc/status', {
    preHandler: [requireAuth, requireIndividual],
    schema: { tags: ['Verification'], summary: 'Get KYC verification status (individuals)' },
    handler: getKycStatusHandler,
  })

  // ─── KYB — Business ──────────────────────────────────────────────────────────
  app.post('/verification/kyb/start', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Start KYB verification via Sumsub (businesses)' },
    handler: startKyb,
  })

  app.get('/verification/kyb/status', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Get KYB verification status (businesses)' },
    handler: getKybStatusHandler,
  })

  // ─── Credit Score — Business ─────────────────────────────────────────────────
  app.post('/verification/credit-score/submit', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Submit financial documents for credit score (businesses)' },
    // Multipart — no body schema, handled manually in controller
    handler: submitCreditScoreHandler,
  })

  app.get('/verification/credit-score/status', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Get credit score request status (businesses)' },
    handler: getCreditScoreStatusHandler,
  })
}

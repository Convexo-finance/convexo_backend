import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { requireIndividual, requireBusiness } from '../../middleware/requireAccountType'
import { env } from '../../config/env'
import { GoneError } from '../../shared/errors'
import {
  getStatus,
  startKyc,
  getKycStatusHandler,
  startKyb,
  getKybStatusHandler,
  submitCreditScoreHandler,
  getCreditScoreStatusHandler,
  submitKybHandler,
  submitKycHandler,
} from './verification.controller'

/**
 * P7 cutover guard. Once the custom doc-upload flow is live (`KYB_CUSTOM_FLOW=true`),
 * the legacy manual-submit endpoints are retired atomically: this preHandler 410s
 * them and points callers at the new `/upload` + `/draft` endpoints. While the flag
 * is off, the legacy path keeps working — so there is never a window where both the
 * old and new flows are disabled. See KYB-CREDIT-SCORE-PLAN.md §4.6 / §8.
 */
function retiredWhenCustomFlowOn(replacement: string) {
  return async (_request: FastifyRequest) => {
    if (env.KYB_CUSTOM_FLOW) {
      throw new GoneError(`This endpoint has been retired. Use ${replacement} instead.`)
    }
  }
}

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

  // ─── KYB Submit — Business (legacy; 410 once KYB_CUSTOM_FLOW is on) ───────────
  app.post('/verification/kyb/submit', {
    preHandler: [requireAuth, requireBusiness, retiredWhenCustomFlowOn('POST /verification/kyb/upload')],
    schema: { tags: ['Verification'], summary: 'Submit KYB documents for manual review (businesses) — legacy, retired when custom flow is enabled' },
    handler: submitKybHandler,
  })

  // ─── KYC Submit — Individual ─────────────────────────────────────────────────
  app.post('/verification/kyc/submit', {
    preHandler: [requireAuth, requireIndividual],
    schema: { tags: ['Verification'], summary: 'Submit KYC documents for manual review (individuals)' },
    handler: submitKycHandler,
  })

  // ─── Credit Score — Business (legacy; 410 once KYB_CUSTOM_FLOW is on) ─────────
  app.post('/verification/credit-score/submit', {
    preHandler: [requireAuth, requireBusiness, retiredWhenCustomFlowOn('POST /verification/credit-score/upload')],
    schema: { tags: ['Verification'], summary: 'Submit financial documents for credit score (businesses) — legacy, retired when custom flow is enabled' },
    // Multipart — no body schema, handled manually in controller
    handler: submitCreditScoreHandler,
  })

  app.get('/verification/credit-score/status', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Get credit score request status (businesses)' },
    handler: getCreditScoreStatusHandler,
  })
}

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { requireIndividual, requireBusiness } from '../../middleware/requireAccountType'
import { GoneError } from '../../shared/errors'
import {
  getStatus,
  startKyc,
  getKycStatusHandler,
  startKyb,
  getKybStatusHandler,
  getCreditScoreStatusHandler,
  kycUploadUrlHandler,
  kycConfirmHandler,
  submitKycHandler,
} from './verification.controller'

/**
 * Legacy multipart submits (manual KYB form, Pinata + n8n credit score) are retired
 * unconditionally since 2026-10-26: on Vercel a request body cannot exceed 4.5 MB,
 * so they could not work anyway. The custom doc-upload flow replaces both.
 */
function retired(replacement: string) {
  return async () => {
    throw new GoneError(`This endpoint has been retired. Use ${replacement} instead.`)
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

  // ─── KYB Submit — Business (legacy multipart; retired) ────────────────────────
  app.post('/verification/kyb/submit', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Retired (410) — use POST /verification/kyb/upload-url' },
    handler: retired('POST /verification/kyb/upload-url'),
  })

  // ─── KYC Submit — Individual (direct-to-Storage uploads) ─────────────────────
  app.post('/verification/kyc/upload-url', {
    preHandler: [requireAuth, requireIndividual],
    schema: { tags: ['Verification'], summary: 'Create a signed Supabase Storage upload URL for a KYC document (individuals)' },
    handler: kycUploadUrlHandler,
  })

  app.post('/verification/kyc/documents/:documentId/confirm', {
    preHandler: [requireAuth, requireIndividual],
    schema: { tags: ['Verification'], summary: 'Confirm an uploaded KYC document (individuals)' },
    handler: kycConfirmHandler,
  })

  app.post('/verification/kyc/submit', {
    preHandler: [requireAuth, requireIndividual],
    schema: { tags: ['Verification'], summary: 'Submit confirmed KYC documents for manual review (individuals)' },
    handler: submitKycHandler,
  })

  // ─── Credit Score — Business (legacy multipart; retired) ──────────────────────
  app.post('/verification/credit-score/submit', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Retired (410) — use POST /verification/credit-score/upload-url' },
    handler: retired('POST /verification/credit-score/upload-url'),
  })

  app.get('/verification/credit-score/status', {
    preHandler: [requireAuth, requireBusiness],
    schema: { tags: ['Verification'], summary: 'Get credit score request status (businesses)' },
    handler: getCreditScoreStatusHandler,
  })
}

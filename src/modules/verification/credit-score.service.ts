import { db } from '../../config/database'
import { logger } from '../../shared/logger'
import { NotFoundError } from '../../shared/errors'

// Legacy multipart submit (Pinata + n8n) was removed 2026-10-26 — superseded by the
// direct-to-Storage custom flow in credit-score-extraction.service.ts.

// ─── Get credit score status ──────────────────────────────────────────────────

export async function getCreditScoreStatus(userId: string) {
  const request = await db.creditScoreRequest.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  if (!request) {
    return { status: 'NOT_STARTED', request: null }
  }

  return { status: request.status, request }
}

// ─── Process n8n callback ────────────────────────────────────────────────────

export interface N8nCreditScoreCallback {
  requestId:       string
  approved:        boolean
  score:           number
  rating:          string
  maxCreditLimit?: string
  analysisNotes?:  string
  rejectionReason?: string
  n8nExecutionId?: string
}

export async function processCreditScoreCallback(payload: N8nCreditScoreCallback) {
  const request = await db.creditScoreRequest.findUnique({
    where: { id: payload.requestId },
    include: { user: { include: { individualProfile: true, businessProfile: true } } },
  })

  if (!request) {
    throw new NotFoundError(`CreditScoreRequest not found: ${payload.requestId}`)
  }

  const newStatus: 'APPROVED' | 'REJECTED' = payload.approved ? 'APPROVED' : 'REJECTED'

  await db.creditScoreRequest.update({
    where: { id: request.id },
    data: {
      status:          newStatus,
      approved:        payload.approved,
      score:           payload.score,
      rating:          payload.rating,
      maxCreditLimit:  payload.maxCreditLimit,
      analysisNotes:   payload.analysisNotes,
      rejectionReason: payload.rejectionReason,
      n8nExecutionId:  payload.n8nExecutionId,
      n8nCallbackAt:   new Date(),
    },
  })

  // If approved, promote to full onboarding completion
  if (payload.approved) {
    await db.user.update({
      where: { id: request.userId },
      data: { onboardingStep: 'COMPLETE' },
    })
  }

  return {
    request,
    newStatus,
    user: request.user,
    email: request.user.businessProfile?.email ?? request.user.individualProfile?.email,
  }
}

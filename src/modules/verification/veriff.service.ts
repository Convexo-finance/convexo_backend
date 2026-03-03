import { createHmac } from 'crypto'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { BadRequestError } from '../../shared/errors'
import { logger } from '../../shared/logger'

const VERIFF_BASE_URL = env.VERIFF_BASE_URL

// ─── Create Veriff session ────────────────────────────────────────────────────

interface CreateSessionOptions {
  userId: string
  walletAddress: string
  firstName?: string
  lastName?: string
}

export async function createVeriffSession(opts: CreateSessionOptions) {
  if (!env.VERIFF_API_KEY) {
    throw new BadRequestError('Veriff integration is not configured.')
  }

  const sessionId = `veriff_${Date.now()}_${opts.userId}`

  const body = {
    verification: {
      callback: `${env.APP_URL}/webhooks/veriff`,
      person: {
        firstName: opts.firstName ?? '',
        lastName: opts.lastName ?? '',
      },
      vendorData: opts.userId,
      timestamp: new Date().toISOString(),
    },
  }

  const response = await fetch(`${VERIFF_BASE_URL}/v1/sessions`, {
    method: 'POST',
    headers: {
      'X-AUTH-CLIENT': env.VERIFF_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    logger.error({ status: response.status, text }, 'Veriff session creation failed')
    throw new BadRequestError('Failed to create Veriff verification session.')
  }

  const data = (await response.json()) as {
    status: string
    verification: { id: string; url: string; sessionToken: string }
  }

  // Store session in DB
  const verification = await db.verification.create({
    data: {
      userId: opts.userId,
      type: 'KYC_INDIVIDUAL',
      provider: 'VERIFF',
      sessionId: data.verification.id,
      status: 'PENDING',
      veriffUrl: data.verification.url,
    },
  })

  // Update onboarding step
  await db.user.update({
    where: { id: opts.userId },
    data: { onboardingStep: 'KYC_PENDING' },
  })

  return {
    verificationId: verification.id,
    sessionId: data.verification.id,
    veriffUrl: data.verification.url,
    status: 'PENDING',
  }
}

// ─── Get KYC status ───────────────────────────────────────────────────────────

export async function getKycStatus(userId: string) {
  const verification = await db.verification.findFirst({
    where: { userId, type: 'KYC_INDIVIDUAL' },
    orderBy: { createdAt: 'desc' },
  })

  if (!verification) {
    return { status: 'NOT_STARTED', verification: null }
  }

  return { status: verification.status, verification }
}

// ─── Verify Veriff webhook HMAC ───────────────────────────────────────────────

export function verifyVeriffWebhook(
  rawBody: string,
  signature: string,
): boolean {
  if (!env.VERIFF_WEBHOOK_SECRET) return true // Skip in dev if not configured

  const expected = createHmac('sha256', env.VERIFF_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')

  return expected === signature
}

// ─── Process Veriff webhook ───────────────────────────────────────────────────

interface VeriffWebhookPayload {
  id: string
  attemptId: string
  feature: string
  code: number
  status: 'approved' | 'declined' | 'resubmission_requested' | 'expired'
  action: string
  vendorData: string  // userId
  person?: { firstName: string; lastName: string }
  technicalData?: { ip: string }
}

export async function processVeriffWebhook(payload: VeriffWebhookPayload) {
  const verification = await db.verification.findFirst({
    where: { sessionId: payload.id },
    include: { user: { include: { individualProfile: true } } },
  })

  if (!verification) {
    logger.warn({ sessionId: payload.id }, 'Veriff webhook: verification not found')
    return null
  }

  const statusMap: Record<string, 'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUESTED' | 'EXPIRED'> = {
    approved: 'APPROVED',
    declined: 'REJECTED',
    resubmission_requested: 'RESUBMISSION_REQUESTED',
    expired: 'EXPIRED',
  }

  const newStatus = statusMap[payload.status] ?? 'PENDING'

  await db.verification.update({
    where: { id: verification.id },
    data: {
      status: newStatus,
      processedAt: new Date(),
    },
  })

  if (newStatus === 'APPROVED') {
    await db.user.update({
      where: { id: verification.userId },
      data: { onboardingStep: 'LP_COMPLETE' },
    })
  }

  return { verification, newStatus, user: verification.user }
}

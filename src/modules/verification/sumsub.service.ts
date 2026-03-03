import { createHmac } from 'crypto'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { BadRequestError } from '../../shared/errors'
import { logger } from '../../shared/logger'

const SUMSUB_BASE_URL = env.SUMSUB_BASE_URL

// ─── Sumsub request signing ───────────────────────────────────────────────────

function signSumsubRequest(
  method: string,
  url: string,
  timestamp: number,
  body?: string,
): string {
  const data = timestamp + method.toUpperCase() + url + (body ?? '')
  return createHmac('sha256', env.SUMSUB_SECRET_KEY ?? '')
    .update(data)
    .digest('hex')
}

async function sumsubRequest<T>(
  method: string,
  path: string,
  body?: object,
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000)
  const bodyStr = body ? JSON.stringify(body) : undefined
  const signature = signSumsubRequest(method, path, timestamp, bodyStr)

  const response = await fetch(`${SUMSUB_BASE_URL}${path}`, {
    method,
    headers: {
      'X-App-Token': env.SUMSUB_APP_TOKEN ?? '',
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': String(timestamp),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: bodyStr,
  })

  if (!response.ok) {
    const text = await response.text()
    logger.error({ status: response.status, path, text }, 'Sumsub API error')
    throw new BadRequestError(`Sumsub API error: ${response.status}`)
  }

  return response.json() as Promise<T>
}

// ─── Create applicant ─────────────────────────────────────────────────────────

interface CreateApplicantOptions {
  userId: string
  walletAddress: string
  email?: string
  levelName: string
}

export async function createSumsubApplicant(opts: CreateApplicantOptions) {
  if (!env.SUMSUB_APP_TOKEN || !env.SUMSUB_SECRET_KEY) {
    throw new BadRequestError('Sumsub integration is not configured.')
  }

  const applicant = await sumsubRequest<{ id: string; externalUserId: string }>(
    'POST',
    `/resources/applicants?levelName=${opts.levelName}`,
    {
      externalUserId: opts.userId,
      email: opts.email,
      lang: 'en',
    },
  )

  // Generate SDK access token
  const tokenData = await sumsubRequest<{ token: string; userId: string }>(
    'POST',
    `/resources/accessTokens?userId=${opts.userId}&levelName=${opts.levelName}&ttlInSecs=3600`,
  )

  // Store verification record
  const verification = await db.verification.create({
    data: {
      userId: opts.userId,
      type: 'KYB_BUSINESS',
      provider: 'SUMSUB',
      sessionId: applicant.id,
      status: 'PENDING',
      applicantId: applicant.id,
      levelName: opts.levelName,
    },
  })

  // Update onboarding step
  await db.user.update({
    where: { id: opts.userId },
    data: { onboardingStep: 'KYB_PENDING' },
  })

  return {
    verificationId: verification.id,
    applicantId: applicant.id,
    sdkToken: tokenData.token,
    status: 'PENDING',
  }
}

// ─── Get KYB status ───────────────────────────────────────────────────────────

export async function getKybStatus(userId: string) {
  const verification = await db.verification.findFirst({
    where: { userId, type: 'KYB_BUSINESS' },
    orderBy: { createdAt: 'desc' },
  })

  if (!verification) {
    return { status: 'NOT_STARTED', verification: null }
  }

  return { status: verification.status, verification }
}

// ─── Verify Sumsub webhook signature ─────────────────────────────────────────

export function verifySumsubWebhook(
  rawBody: string,
  digest: string,
): boolean {
  if (!env.SUMSUB_WEBHOOK_SECRET) return true

  const expected = createHmac('sha256', env.SUMSUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')

  return expected === digest
}

// ─── Process Sumsub webhook ───────────────────────────────────────────────────

interface SumsubWebhookPayload {
  type: string
  applicantId: string
  applicantType: string
  correlationId: string
  externalUserId: string   // our userId
  levelName: string
  reviewStatus: string
  reviewResult?: {
    reviewAnswer: 'GREEN' | 'RED'
    rejectLabels?: string[]
    reviewRejectType?: string
    clientComment?: string
  }
}

export async function processSumsubWebhook(payload: SumsubWebhookPayload) {
  const verification = await db.verification.findFirst({
    where: { applicantId: payload.applicantId },
    include: { user: { include: { businessProfile: true } } },
  })

  if (!verification) {
    logger.warn({ applicantId: payload.applicantId }, 'Sumsub webhook: verification not found')
    return null
  }

  // Only process final decisions
  if (payload.type !== 'applicantReviewed') {
    return { verification, newStatus: verification.status, skipped: true }
  }

  const approved = payload.reviewResult?.reviewAnswer === 'GREEN'
  const newStatus = approved ? 'APPROVED' : 'REJECTED'
  const rejectionReason = payload.reviewResult?.rejectLabels?.join(', ')

  await db.verification.update({
    where: { id: verification.id },
    data: {
      status: newStatus,
      rejectionReason: rejectionReason ?? null,
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

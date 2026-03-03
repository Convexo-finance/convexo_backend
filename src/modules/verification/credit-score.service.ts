import { Readable } from 'stream'
import PinataClient from '@pinata/sdk'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { logger } from '../../shared/logger'
import { BadRequestError, NotFoundError } from '../../shared/errors'
import type { CreditScoreSubmitInput } from './verification.schema'

// ─── Pinata IPFS upload ───────────────────────────────────────────────────────

function getPinata(): PinataClient {
  if (!env.PINATA_JWT) {
    throw new BadRequestError('Pinata is not configured — cannot upload documents.')
  }
  return new PinataClient({ pinataJWTKey: env.PINATA_JWT })
}

async function uploadToPinata(
  fileBuffer: Buffer,
  filename: string,
): Promise<string> {
  const pinata  = getPinata()
  const stream  = Readable.from(fileBuffer) as NodeJS.ReadableStream
  const result  = await pinata.pinFileToIPFS(stream, {
    pinataMetadata: { name: filename },
    pinataOptions:  { cidVersion: 1 },
  })
  return result.IpfsHash
}

// ─── Submit Credit Score request ─────────────────────────────────────────────

export interface CreditScoreDocuments {
  incomeStatement: { buffer: Buffer; filename: string; mimetype: string }
  balanceSheet:    { buffer: Buffer; filename: string; mimetype: string }
  cashFlow:        { buffer: Buffer; filename: string; mimetype: string }
}

export async function submitCreditScore(
  userId: string,
  walletAddress: string,
  docs: CreditScoreDocuments,
  formData: CreditScoreSubmitInput,
) {
  // Block duplicate pending/under-review requests
  const existing = await db.creditScoreRequest.findFirst({
    where: {
      userId,
      status: { in: ['PENDING', 'UNDER_REVIEW'] },
    },
  })
  if (existing) {
    throw new BadRequestError('A credit score request is already under review.')
  }

  // Upload all 3 docs to Pinata in parallel
  const [incomeStatementCid, balanceSheetCid, cashFlowCid] = await Promise.all([
    uploadToPinata(docs.incomeStatement.buffer, docs.incomeStatement.filename),
    uploadToPinata(docs.balanceSheet.buffer, docs.balanceSheet.filename),
    uploadToPinata(docs.cashFlow.buffer, docs.cashFlow.filename),
  ])

  // Create DB record
  const request = await db.creditScoreRequest.create({
    data: {
      userId,
      incomeStatementCid,
      balanceSheetCid,
      cashFlowCid,
      period:            formData.period,
      annualRevenue:     formData.annualRevenue,
      netProfit:         formData.netProfit,
      totalAssets:       formData.totalAssets,
      totalLiabilities:  formData.totalLiabilities,
      employeeCount:     formData.employeeCount,
      yearsOperating:    formData.yearsOperating,
      existingDebt:      formData.existingDebt,
      monthlyExpenses:   formData.monthlyExpenses,
      additionalContext: formData.additionalContext,
      status:            'PENDING',
    },
  })

  // Update onboarding step
  await db.user.update({
    where: { id: userId },
    data: { onboardingStep: 'CREDIT_SCORE_PENDING' },
  })

  // Fire n8n webhook (non-blocking — log errors but don't fail the request)
  if (env.N8N_WEBHOOK_URL) {
    fireN8nWebhook(request.id, userId, walletAddress, {
      incomeStatementCid,
      balanceSheetCid,
      cashFlowCid,
      gateway: env.PINATA_GATEWAY,
      ...formData,
    }).catch((err) => {
      logger.error({ err, requestId: request.id }, 'Failed to fire n8n credit-score webhook')
    })
  } else {
    logger.warn('N8N_WEBHOOK_URL not set — skipping credit score automation')
  }

  return {
    requestId: request.id,
    status: 'PENDING',
    incomeStatementCid,
    balanceSheetCid,
    cashFlowCid,
  }
}

async function fireN8nWebhook(
  requestId: string,
  userId: string,
  walletAddress: string,
  payload: Record<string, unknown>,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (env.N8N_WEBHOOK_SECRET) {
    headers['Authorization'] = `Bearer ${env.N8N_WEBHOOK_SECRET}`
  }

  const response = await fetch(env.N8N_WEBHOOK_URL!, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requestId,
      userId,
      walletAddress,
      callbackUrl: `${env.APP_URL}/webhooks/n8n/credit-score`,
      ...payload,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`n8n webhook error ${response.status}: ${text}`)
  }

  // Record that we fired the webhook
  await db.creditScoreRequest.update({
    where: { id: requestId },
    data: {
      status: 'UNDER_REVIEW',
      submittedToN8nAt: new Date(),
    },
  })

  logger.info({ requestId }, 'Credit score request sent to n8n')
}

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

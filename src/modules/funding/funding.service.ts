import { db } from '../../config/database'
import { env } from '../../config/env'
import { NotFoundError, ForbiddenError } from '../../shared/errors'
import { sendEmail, sendTelegram } from '../notifications/notifications.service'
import { logger } from '../../shared/logger'
import type { CreateFundingRequestInput, ReviewFundingRequestInput, ListFundingRequestsInput } from './funding.schema'

// ─── User — submit funding request ───────────────────────────────────────────

export async function createFundingRequest(
  userId: string,
  walletAddress: string,
  input: CreateFundingRequestInput,
) {
  const request = await db.fundingRequest.create({
    data: {
      userId,
      amount:       input.amount,
      currency:     input.currency,
      purpose:      input.purpose,
      term:         input.term,
      interestRate: input.interestRate,
      collateral:   input.collateral,
      status:       'PENDING',
    },
    include: { user: { include: { businessProfile: true } } },
  })

  // Notify admin via Telegram
  if (env.TELEGRAM_ADMIN_CHAT_ID) {
    const company = request.user.businessProfile?.companyName ?? walletAddress
    sendTelegram({
      userId,
      chatId: env.TELEGRAM_ADMIN_CHAT_ID,
      text: [
        `🏦 <b>New Funding Request</b>`,
        ``,
        `Company:  <b>${company}</b>`,
        `Amount:   <code>${input.amount} ${input.currency}</code>`,
        `Term:     ${input.term ? `${input.term} months` : 'Not specified'}`,
        `Wallet:   <code>${walletAddress}</code>`,
        `Request:  <code>${request.id}</code>`,
        ``,
        `Review: ${env.APP_URL}/admin/funding`,
      ].join('\n'),
    }).catch((err) => logger.error({ err }, 'Funding Telegram notify failed'))
  }

  return request
}

// ─── User — list my funding requests ─────────────────────────────────────────

export async function listMyFundingRequests(userId: string, query: ListFundingRequestsInput) {
  const where: Record<string, unknown> = { userId }
  if (query.status) where['status'] = query.status

  const [items, total] = await Promise.all([
    db.fundingRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
    }),
    db.fundingRequest.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

// ─── User — get single funding request ───────────────────────────────────────

export async function getMyFundingRequest(userId: string, id: string) {
  const req = await db.fundingRequest.findUnique({ where: { id } })
  if (!req) throw new NotFoundError('Funding request')
  if (req.userId !== userId) throw new ForbiddenError()
  return req
}

// ─── Admin — list all funding requests ───────────────────────────────────────

export async function listAllFundingRequests(query: ListFundingRequestsInput) {
  const where: Record<string, unknown> = {}
  if (query.status) where['status'] = query.status

  const [items, total] = await Promise.all([
    db.fundingRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
      include: {
        user: {
          select: {
            walletAddress: true,
            businessProfile: {
              select: { companyName: true, email: true, repFirstName: true, repLastName: true },
            },
          },
        },
      },
    }),
    db.fundingRequest.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

// ─── Admin — review funding request ──────────────────────────────────────────

export async function reviewFundingRequest(
  id: string,
  reviewerId: string,
  input: ReviewFundingRequestInput,
) {
  const req = await db.fundingRequest.findUnique({
    where: { id },
    include: { user: { include: { businessProfile: true } } },
  })
  if (!req) throw new NotFoundError('Funding request')

  const updated = await db.fundingRequest.update({
    where: { id },
    data: {
      status:     input.status as 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW',
      adminNotes: input.adminNotes,
      vaultId:    input.vaultId,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    },
  })

  // Notify user of decision
  const email = req.user.businessProfile?.email
  if (email) {
    const statusLabels: Record<string, string> = {
      APPROVED:     '✅ Approved',
      REJECTED:     '❌ Not Approved',
      UNDER_REVIEW: '🔍 Under Review',
    }
    sendEmail({
      userId: req.userId,
      to:     email,
      subject: `Funding Request ${statusLabels[input.status] ?? input.status}`,
      html: `
        <h2>Funding Request Update</h2>
        <p>Your funding request of <strong>${req.amount} ${req.currency}</strong> has been updated.</p>
        <p>Status: <strong>${statusLabels[input.status] ?? input.status}</strong></p>
        ${input.adminNotes ? `<p>Notes: ${input.adminNotes}</p>` : ''}
        ${input.vaultId ? `<p>Vault ID: <code>${input.vaultId}</code></p>` : ''}
        <p><a href="${env.FRONTEND_URL}/funding">View your funding requests →</a></p>
      `,
    }).catch((err) => logger.error({ err }, 'Funding review email failed'))
  }

  return updated
}

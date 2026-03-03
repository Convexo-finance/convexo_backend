import { db } from '../../config/database'
import { env } from '../../config/env'
import { NotFoundError, ForbiddenError } from '../../shared/errors'
import { notifyVerificationApproved, notifyVerificationRejected } from '../notifications/notifications.service'
import { logger } from '../../shared/logger'
import type {
  ListUsersInput,
  GrantAdminRoleInput,
  OverrideVerificationInput,
  RecordNftInput,
  OverrideCreditScoreInput,
} from './admin.schema'

// ─── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(query: ListUsersInput) {
  const where: Record<string, unknown> = {}

  if (query.accountType) where['accountType'] = query.accountType

  if (query.search) {
    where['OR'] = [
      { walletAddress:       { contains: query.search, mode: 'insensitive' } },
      { individualProfile:   { OR: [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName:  { contains: query.search, mode: 'insensitive' } },
        { email:     { contains: query.search, mode: 'insensitive' } },
      ]}},
      { businessProfile: { OR: [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { email:       { contains: query.search, mode: 'insensitive' } },
      ]}},
    ]
  }

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
      include: {
        individualProfile: { select: { firstName: true, lastName: true, email: true, avatarUrl: true } },
        businessProfile:   { select: { companyName: true, email: true, logoUrl: true } },
        reputation:        { select: { tier: true, tierName: true } },
        adminRole:         { select: { role: true } },
      },
    }),
    db.user.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

export async function getUserDetails(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    include: {
      individualProfile: true,
      businessProfile:   true,
      reputation:        true,
      adminRole:         true,
      verifications:     { orderBy: { createdAt: 'desc' } },
      creditScoreRequests: { orderBy: { createdAt: 'desc' }, take: 5 },
      bankAccounts:      true,
    },
  })
  if (!user) throw new NotFoundError('User')
  return user
}

// ─── Admin roles ──────────────────────────────────────────────────────────────

export async function grantAdminRole(grantedBy: string, input: GrantAdminRoleInput) {
  await db.user.findUniqueOrThrow({ where: { id: input.userId } })

  return db.adminRole.upsert({
    where:  { userId: input.userId },
    create: { userId: input.userId, role: input.role, grantedBy },
    update: { role: input.role, grantedBy },
  })
}

export async function revokeAdminRole(targetUserId: string, revokedBy: string) {
  const role = await db.adminRole.findUnique({ where: { userId: targetUserId } })
  if (!role) throw new NotFoundError('Admin role')

  // Guard: cannot revoke your own SUPER_ADMIN role
  if (targetUserId === revokedBy) {
    throw new ForbiddenError('Cannot revoke your own admin role.')
  }

  await db.adminRole.delete({ where: { userId: targetUserId } })
}

// ─── Verifications ────────────────────────────────────────────────────────────

export async function listAllVerifications(query: {
  type?: string
  status?: string
  limit: number
  offset: number
}) {
  const where: Record<string, unknown> = {}
  if (query.type)   where['type']   = query.type
  if (query.status) where['status'] = query.status

  const [items, total] = await Promise.all([
    db.verification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
      include: {
        user: {
          select: {
            walletAddress: true,
            accountType:   true,
            individualProfile: { select: { firstName: true, lastName: true, email: true } },
            businessProfile:   { select: { companyName: true, email: true } },
          },
        },
      },
    }),
    db.verification.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

export async function overrideVerification(
  id: string,
  adminId: string,
  input: OverrideVerificationInput,
) {
  const verification = await db.verification.findUnique({
    where: { id },
    include: { user: { include: { individualProfile: true, businessProfile: true } } },
  })
  if (!verification) throw new NotFoundError('Verification')

  const updated = await db.verification.update({
    where: { id },
    data: {
      status:          input.status,
      rejectionReason: input.rejectionReason,
      nftTokenId:      input.nftTokenId,
      processedAt:     new Date(),
      processedBy:     adminId,
    },
  })

  // Sync onboarding step if approved
  if (input.status === 'APPROVED') {
    const nextStep = verification.type === 'CREDIT_SCORE' ? 'COMPLETE' : 'LP_COMPLETE'
    await db.user.update({
      where: { id: verification.userId },
      data:  { onboardingStep: nextStep },
    })
  }

  // Notify user
  const email =
    verification.user.individualProfile?.email ??
    verification.user.businessProfile?.email

  if (email) {
    if (input.status === 'APPROVED') {
      notifyVerificationApproved(verification.userId, email, verification.type).catch(
        (err) => logger.error({ err }, 'Admin override approval email failed'),
      )
    } else if (input.status === 'REJECTED') {
      notifyVerificationRejected(
        verification.userId,
        email,
        verification.type,
        input.rejectionReason,
      ).catch((err) => logger.error({ err }, 'Admin override rejection email failed'))
    }
  }

  return updated
}

export async function recordVerificationNft(id: string, adminId: string, input: RecordNftInput) {
  const verification = await db.verification.findUnique({ where: { id } })
  if (!verification) throw new NotFoundError('Verification')

  return db.verification.update({
    where: { id },
    data: {
      nftTokenId:  input.nftTokenId,
      processedBy: adminId,
    },
  })
}

// ─── Credit Score admin ───────────────────────────────────────────────────────

export async function listAllCreditScoreRequests(query: {
  status?: string
  limit: number
  offset: number
}) {
  const where: Record<string, unknown> = {}
  if (query.status) where['status'] = query.status

  const [items, total] = await Promise.all([
    db.creditScoreRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
      include: {
        user: {
          select: {
            walletAddress: true,
            businessProfile: { select: { companyName: true, email: true } },
          },
        },
      },
    }),
    db.creditScoreRequest.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

export async function adminOverrideCreditScore(
  id: string,
  adminId: string,
  input: OverrideCreditScoreInput,
) {
  const req = await db.creditScoreRequest.findUnique({
    where: { id },
    include: { user: { include: { businessProfile: true } } },
  })
  if (!req) throw new NotFoundError('Credit score request')

  const newStatus: 'APPROVED' | 'REJECTED' = input.approved ? 'APPROVED' : 'REJECTED'

  const updated = await db.creditScoreRequest.update({
    where: { id },
    data: {
      status:          newStatus,
      approved:        input.approved,
      score:           input.score,
      rating:          input.rating,
      maxCreditLimit:  input.maxCreditLimit,
      analysisNotes:   input.analysisNotes,
      rejectionReason: input.rejectionReason,
      n8nCallbackAt:   new Date(),
    },
  })

  if (input.approved) {
    await db.user.update({
      where: { id: req.userId },
      data:  { onboardingStep: 'COMPLETE' },
    })
  }

  // Notify admin to mint NFT
  logger.info({ requestId: id, adminId, approved: input.approved }, 'Credit score manually overridden')

  return updated
}

export async function recordCreditScoreNft(id: string, nftTokenId: string) {
  const req = await db.creditScoreRequest.findUnique({ where: { id } })
  if (!req) throw new NotFoundError('Credit score request')

  return db.creditScoreRequest.update({
    where: { id },
    data: {
      status:      'COMPLETE',
      nftTokenId,
      nftMintedAt: new Date(),
    },
  })
}

import { randomUUID } from 'crypto'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { logger } from '../../shared/logger'
import { BadRequestError } from '../../shared/errors'
import { createUploadIntent, confirmUpload, type UploadIntentBody } from '../../shared/document-store'
import { sendTelegram } from '../notifications/notifications.service'

/**
 * Manual KYC (LP Individuals) — documents go direct to Supabase Storage:
 *
 *   POST /verification/kyc/upload-url                 → DRAFT KycSubmission + signed URL
 *   (browser PUTs each file to Storage)
 *   POST /verification/kyc/documents/:id/confirm      → verify object, mark UPLOADED
 *   POST /verification/kyc/submit                     → DRAFT → PENDING (admin review)
 *
 * Replaces the multipart submit (Vercel caps request bodies at 4.5 MB).
 */

export type KycFieldName = 'governmentId' | 'proofOfAddress' | 'rutDocument'

const REQUIRED_FIELDS: KycFieldName[] = ['governmentId', 'proofOfAddress']

async function assertNoPendingReview(userId: string) {
  const existing = await db.kycSubmission.findFirst({ where: { userId, status: 'PENDING' }, select: { id: true } })
  if (existing) throw new BadRequestError('A KYC submission is already under review.')
}

async function getOrCreateDraft(userId: string): Promise<string> {
  const draft = await db.kycSubmission.findFirst({
    where:   { userId, status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
    select:  { id: true },
  })
  if (draft) return draft.id
  const created = await db.kycSubmission.create({ data: { userId, status: 'DRAFT' }, select: { id: true } })
  return created.id
}

export async function createKycUploadIntent(userId: string, fieldName: KycFieldName, body: UploadIntentBody) {
  await assertNoPendingReview(userId)
  const submissionId = await getOrCreateDraft(userId)
  const intent = await createUploadIntent({
    userId,
    purpose: 'kyc',
    fieldName,
    parent:  { kycSubmissionId: submissionId },
    ...body,
  })
  return { submissionId, fieldName, ...intent }
}

export async function confirmKycDocument(userId: string, documentId: string) {
  const doc = await confirmUpload(userId, documentId, 'kyc')
  return {
    documentId:   doc.documentId,
    submissionId: doc.kycSubmissionId,
    fieldName:    doc.fieldName,
    filename:     doc.filename,
    sizeBytes:    doc.sizeBytes,
    status:       'UPLOADED' as const,
  }
}

export async function submitKyc(userId: string, walletAddress: string) {
  await assertNoPendingReview(userId)

  const draft = await db.kycSubmission.findFirst({
    where:   { userId, status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
    select:  {
      id:        true,
      documents: { where: { status: 'UPLOADED' }, select: { fieldName: true } },
    },
  })
  if (!draft) throw new BadRequestError('Upload your documents before submitting.')

  const uploaded = new Set(draft.documents.map((d) => d.fieldName))
  const missing = REQUIRED_FIELDS.filter((f) => !uploaded.has(f))
  if (missing.length > 0) {
    throw new BadRequestError(`Missing required document(s): ${missing.join(', ')}`)
  }

  const submission = await db.kycSubmission.update({
    where: { id: draft.id },
    data:  { status: 'PENDING' },
  })

  await db.verification.create({
    data: {
      userId,
      type:      'KYC_INDIVIDUAL',
      provider:  'INTERNAL',
      sessionId: randomUUID(),
      status:    'PENDING',
    },
  })

  await db.user.update({
    where: { id: userId },
    data:  { onboardingStep: 'KYC_PENDING' },
  })

  if (env.TELEGRAM_ADMIN_CHAT_ID) {
    sendTelegram({
      userId,
      chatId: env.TELEGRAM_ADMIN_CHAT_ID,
      text: [
        `🪪 <b>New KYC Submission</b>`,
        ``,
        `Wallet: <code>${walletAddress}</code>`,
        `ID:     <code>${submission.id}</code>`,
        `Docs:   ${draft.documents.length} file(s) stored securely`,
        ``,
        `Review: ${env.APP_URL}/admin/kyc`,
      ].join('\n'),
    }).catch((err) => logger.error({ err }, 'KYC Telegram notify failed'))
  }

  return {
    submissionId:  submission.id,
    status:        'PENDING',
    documentCount: draft.documents.length,
  }
}

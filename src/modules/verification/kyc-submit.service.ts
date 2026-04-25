import { randomUUID } from 'crypto'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { logger } from '../../shared/logger'
import { BadRequestError } from '../../shared/errors'
import { sendTelegram } from '../notifications/notifications.service'

export interface KycFiles {
  governmentId:   { buffer: Buffer; filename: string; mimetype: string }
  proofOfAddress: { buffer: Buffer; filename: string; mimetype: string }
  rutDocument?:   { buffer: Buffer; filename: string; mimetype: string }
}

export async function submitKyc(
  userId: string,
  walletAddress: string,
  files: KycFiles,
) {
  const existing = await db.kycSubmission.findFirst({
    where: { userId, status: 'PENDING' },
  })
  if (existing) throw new BadRequestError('A KYC submission is already under review.')

  const submission = await db.kycSubmission.create({
    data: { userId, status: 'PENDING' },
  })

  const filesToSave = [
    { fieldName: 'governmentId',   file: files.governmentId },
    { fieldName: 'proofOfAddress', file: files.proofOfAddress },
    ...(files.rutDocument
      ? [{ fieldName: 'rutDocument', file: files.rutDocument }]
      : []),
  ]

  await Promise.all(
    filesToSave.map(({ fieldName, file }) =>
      db.submissionDocument.create({
        data: {
          userId,
          kycSubmissionId: submission.id,
          fieldName,
          filename:  file.filename,
          mimeType:  file.mimetype,
          sizeBytes: file.buffer.length,
          content:   file.buffer,
        },
      })
    )
  )

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
        `Docs:   ${filesToSave.length} file(s) stored securely`,
        ``,
        `Review: ${env.APP_URL}/admin/kyc`,
      ].join('\n'),
    }).catch((err) => logger.error({ err }, 'KYC Telegram notify failed'))
  }

  return {
    submissionId:  submission.id,
    status:        'PENDING',
    documentCount: filesToSave.length,
  }
}

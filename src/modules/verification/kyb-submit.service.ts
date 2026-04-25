import { randomUUID } from 'crypto'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { logger } from '../../shared/logger'
import { BadRequestError } from '../../shared/errors'
import { sendTelegram } from '../notifications/notifications.service'
import type { KybSubmitInput } from './verification.schema'

export interface KybFiles {
  incorporationCertificate: { buffer: Buffer; filename: string; mimetype: string }
  taxDocument:              { buffer: Buffer; filename: string; mimetype: string }
  proofOfAddress:           { buffer: Buffer; filename: string; mimetype: string }
  representativeId:         { buffer: Buffer; filename: string; mimetype: string }
  shareholdersCertificate?: { buffer: Buffer; filename: string; mimetype: string }
}

export async function submitKyb(
  userId: string,
  walletAddress: string,
  files: KybFiles,
  formData: KybSubmitInput,
) {
  const existing = await db.kybSubmission.findFirst({
    where: { userId, status: 'PENDING' },
  })
  if (existing) throw new BadRequestError('A KYB submission is already under review.')

  const submission = await db.kybSubmission.create({
    data: {
      userId,
      companyName:         formData.companyName,
      country:             formData.country,
      companyType:         formData.companyType,
      incorporationNumber: formData.incorporationNumber,
      taxNumber:           formData.taxNumber,
      street:              formData.street,
      city:                formData.city,
      stateRegion:         formData.stateRegion,
      officeCountry:       formData.officeCountry,
      repFirstName:        formData.repFirstName,
      repLastName:         formData.repLastName,
      repDocType:          formData.repDocType,
      repDocNumber:        formData.repDocNumber,
      repEmail:            formData.repEmail,
      repPhone:            formData.repPhone,
      shareholders:        formData.shareholders,
      status:              'PENDING',
    },
  })

  // Store each file as a row in SubmissionDocument
  const filesToSave = [
    { fieldName: 'incorporationCertificate', file: files.incorporationCertificate },
    { fieldName: 'taxDocument',              file: files.taxDocument },
    { fieldName: 'proofOfAddress',           file: files.proofOfAddress },
    { fieldName: 'representativeId',         file: files.representativeId },
    ...(files.shareholdersCertificate
      ? [{ fieldName: 'shareholdersCertificate', file: files.shareholdersCertificate }]
      : []),
  ]

  await Promise.all(
    filesToSave.map(({ fieldName, file }) =>
      db.submissionDocument.create({
        data: {
          userId,
          kybSubmissionId: submission.id,
          fieldName,
          filename:  file.filename,
          mimeType:  file.mimetype,
          sizeBytes: file.buffer.length,
          content:   file.buffer,
        },
      })
    )
  )

  // Create Verification record so GET /verification/status returns PENDING immediately
  await db.verification.create({
    data: {
      userId,
      type:      'KYB_BUSINESS',
      provider:  'INTERNAL',
      sessionId: randomUUID(),
      status:    'PENDING',
    },
  })

  await db.user.update({
    where: { id: userId },
    data:  { onboardingStep: 'KYB_PENDING' },
  })

  if (env.TELEGRAM_ADMIN_CHAT_ID) {
    sendTelegram({
      userId,
      chatId: env.TELEGRAM_ADMIN_CHAT_ID,
      text: [
        `📋 <b>New KYB Submission</b>`,
        ``,
        `Company: <b>${formData.companyName}</b>`,
        `Country: ${formData.country} | Type: ${formData.companyType}`,
        `Rep:     ${formData.repFirstName} ${formData.repLastName}`,
        `Wallet:  <code>${walletAddress}</code>`,
        `ID:      <code>${submission.id}</code>`,
        `Docs:    ${filesToSave.length} file(s) stored securely`,
        ``,
        `Review: ${env.APP_URL}/admin/kyb`,
      ].join('\n'),
    }).catch((err) => logger.error({ err }, 'KYB Telegram notify failed'))
  }

  return {
    submissionId:  submission.id,
    status:        'PENDING',
    documentCount: filesToSave.length,
  }
}

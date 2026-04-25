import { Readable } from 'stream'
import { randomUUID } from 'crypto'
import PinataClient from '@pinata/sdk'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { logger } from '../../shared/logger'
import { BadRequestError } from '../../shared/errors'
import { sendTelegram } from '../notifications/notifications.service'
import type { KybSubmitInput } from './verification.schema'

export interface KybFiles {
  incorporationCertificate: { buffer: Buffer; filename: string }
  taxDocument:              { buffer: Buffer; filename: string }
  proofOfAddress:           { buffer: Buffer; filename: string }
  representativeId:         { buffer: Buffer; filename: string }
  shareholdersCertificate?: { buffer: Buffer; filename: string }
}

// ─── Pinata upload ────────────────────────────────────────────────────────────

function getPinata(): PinataClient {
  if (!env.PINATA_JWT) throw new BadRequestError('Pinata is not configured — cannot upload documents.')
  return new PinataClient({ pinataJWTKey: env.PINATA_JWT })
}

async function uploadToPinata(buffer: Buffer, filename: string): Promise<string> {
  const pinata = getPinata()
  const stream = Readable.from(buffer) as NodeJS.ReadableStream
  const result = await pinata.pinFileToIPFS(stream, {
    pinataMetadata: { name: filename },
    pinataOptions:  { cidVersion: 1 },
  })
  return result.IpfsHash
}

// ─── Submit KYB ───────────────────────────────────────────────────────────────

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

  // Upload all required docs in parallel
  const uploadPromises: Promise<string>[] = [
    uploadToPinata(files.incorporationCertificate.buffer, files.incorporationCertificate.filename),
    uploadToPinata(files.taxDocument.buffer,              files.taxDocument.filename),
    uploadToPinata(files.proofOfAddress.buffer,           files.proofOfAddress.filename),
    uploadToPinata(files.representativeId.buffer,         files.representativeId.filename),
  ]
  if (files.shareholdersCertificate) {
    uploadPromises.push(
      uploadToPinata(files.shareholdersCertificate.buffer, files.shareholdersCertificate.filename)
    )
  }

  const cids = await Promise.all(uploadPromises)
  const [incorporationCertificateCid, taxDocumentCid, proofOfAddressCid, representativeIdCid] = cids
  const shareholdersCertificateCid = files.shareholdersCertificate ? cids[4] : undefined

  const submission = await db.kybSubmission.create({
    data: {
      userId,
      ...formData,
      shareholders:               formData.shareholders,
      incorporationCertificateCid,
      taxDocumentCid,
      proofOfAddressCid,
      representativeIdCid,
      shareholdersCertificateCid,
      status: 'PENDING',
    },
  })

  // Create Verification record so getStatus() picks it up
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
        ``,
        `Review: ${env.APP_URL}/admin/kyb`,
      ].join('\n'),
    }).catch((err) => logger.error({ err }, 'KYB Telegram notify failed'))
  }

  return {
    submissionId: submission.id,
    status: 'PENDING',
    incorporationCertificateCid,
    taxDocumentCid,
    proofOfAddressCid,
    representativeIdCid,
    shareholdersCertificateCid,
  }
}

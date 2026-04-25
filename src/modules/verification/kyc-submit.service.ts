import { Readable } from 'stream'
import { randomUUID } from 'crypto'
import PinataClient from '@pinata/sdk'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { logger } from '../../shared/logger'
import { BadRequestError } from '../../shared/errors'
import { sendTelegram } from '../notifications/notifications.service'

export interface KycFiles {
  governmentId:   { buffer: Buffer; filename: string }
  proofOfAddress: { buffer: Buffer; filename: string }
  rutDocument?:   { buffer: Buffer; filename: string }
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

// ─── Submit KYC ───────────────────────────────────────────────────────────────

export async function submitKyc(
  userId: string,
  walletAddress: string,
  files: KycFiles,
) {
  const existing = await db.kycSubmission.findFirst({
    where: { userId, status: 'PENDING' },
  })
  if (existing) throw new BadRequestError('A KYC submission is already under review.')

  const uploadPromises: Promise<string>[] = [
    uploadToPinata(files.governmentId.buffer,   files.governmentId.filename),
    uploadToPinata(files.proofOfAddress.buffer, files.proofOfAddress.filename),
  ]
  if (files.rutDocument) {
    uploadPromises.push(uploadToPinata(files.rutDocument.buffer, files.rutDocument.filename))
  }

  const cids = await Promise.all(uploadPromises)
  const [governmentIdCid, proofOfAddressCid] = cids
  const rutDocumentCid = files.rutDocument ? cids[2] : undefined

  const submission = await db.kycSubmission.create({
    data: {
      userId,
      governmentIdCid,
      proofOfAddressCid,
      rutDocumentCid,
      status: 'PENDING',
    },
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
        ``,
        `Review: ${env.APP_URL}/admin/kyc`,
      ].join('\n'),
    }).catch((err) => logger.error({ err }, 'KYC Telegram notify failed'))
  }

  return {
    submissionId: submission.id,
    status: 'PENDING',
    governmentIdCid,
    proofOfAddressCid,
    rutDocumentCid,
  }
}

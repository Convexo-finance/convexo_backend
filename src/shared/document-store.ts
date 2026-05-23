import { createHash } from 'crypto'
import { db } from '../config/database'
import { logger } from './logger'
import { NotFoundError, BadRequestError } from './errors'
import { encryptBuffer, decryptBuffer } from './encryption'

/**
 * Stores KYB/KYC/CS submission documents.
 *
 * v1 backend: encrypted blobs in Postgres `SubmissionDocument.content` (Bytes).
 * v2 (planned): migrate to Cloudflare R2 — same interface, add `storageBackend`
 * column on the model, dual-write for one release, backfill, drop `content`.
 * See KYB-CREDIT-SCORE-PLAN.md §4.1 and §7.
 *
 * Wire format inside `content`: `iv (12B) || authTag (16B) || ciphertext`.
 */

const MAX_DOC_BYTES   = 20 * 1024 * 1024 // 20 MB — matches @fastify/multipart limit
const ALLOWED_MIME    = new Set(['application/pdf', 'image/jpeg', 'image/png'])

export interface StoreDocumentInput {
  userId:          string
  fieldName:       string
  filename:        string
  mimeType:        string
  content:         Buffer
  kybSubmissionId?: string
  kycSubmissionId?: string
}

export interface StoredDocument {
  documentId:     string
  sizeBytes:      number
  sha256:         string
  mimeType:       string
  encryptedAtApp: true
}

export async function storeDocument(input: StoreDocumentInput): Promise<StoredDocument> {
  if (input.content.length === 0) throw new BadRequestError('Document is empty.')
  if (input.content.length > MAX_DOC_BYTES) {
    throw new BadRequestError(`Document exceeds the ${MAX_DOC_BYTES / 1024 / 1024} MB limit.`)
  }
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw new BadRequestError(`MIME type not allowed: ${input.mimeType}`)
  }
  if (!input.kybSubmissionId && !input.kycSubmissionId) {
    throw new BadRequestError('Document must be attached to a KYB or KYC submission.')
  }

  const sha256    = createHash('sha256').update(input.content).digest('hex')
  const encrypted = encryptBuffer(input.content)

  const row = await db.submissionDocument.create({
    data: {
      userId:          input.userId,
      fieldName:       input.fieldName,
      filename:        input.filename,
      mimeType:        input.mimeType,
      sizeBytes:       input.content.length,
      content:         encrypted,
      kybSubmissionId: input.kybSubmissionId ?? null,
      kycSubmissionId: input.kycSubmissionId ?? null,
    },
    select: { id: true },
  })

  logger.info(
    { documentId: row.id, sizeBytes: input.content.length, mimeType: input.mimeType, sha256 },
    'document.stored',
  )

  return {
    documentId:     row.id,
    sizeBytes:      input.content.length,
    sha256,
    mimeType:       input.mimeType,
    encryptedAtApp: true,
  }
}

/**
 * Reads and decrypts a stored document. Caller is responsible for streaming
 * the returned Buffer back to the client (or feeding it to Claude).
 */
export async function readDocumentBuffer(documentId: string): Promise<{
  buffer:   Buffer
  filename: string
  mimeType: string
}> {
  const row = await db.submissionDocument.findUnique({
    where:  { id: documentId },
    select: { content: true, filename: true, mimeType: true },
  })
  if (!row) throw new NotFoundError('SubmissionDocument')

  return {
    buffer:   decryptBuffer(row.content as Buffer),
    filename: row.filename,
    mimeType: row.mimeType,
  }
}

export async function deleteDocument(documentId: string): Promise<void> {
  await db.submissionDocument.delete({ where: { id: documentId } })
  logger.info({ documentId }, 'document.deleted')
}

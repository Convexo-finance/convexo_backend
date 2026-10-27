import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { db } from '../config/database'
import { env } from '../config/env'
import { documentsBucket } from '../config/supabase'
import { logger } from './logger'
import { NotFoundError, BadRequestError, ConflictError } from './errors'

/**
 * KYB / KYC / credit-score submission documents — Supabase Storage (private bucket).
 *
 * Two-step direct upload (the API runs on Vercel, request bodies cap at 4.5 MB, so
 * file bytes never transit the API):
 *
 *   1. createUploadIntent()  — validates purpose / field / MIME / size, inserts a
 *      PENDING SubmissionDocument row and returns a single-object signed upload URL
 *      (`createSignedUploadUrl`, no upsert, valid 2 h).
 *   2. Browser PUTs the file straight to Storage.
 *   3. confirmUpload()       — downloads the object with the service role, checks
 *      size === declared, stored content-type === declared, magic bytes match,
 *      records sha256, flips the row to UPLOADED, and hands the bytes back so the
 *      caller can run Claude extraction without a second download.
 *
 * Reads for extraction use `readDocumentBuffer()`; admin downloads use
 * `createDownloadUrl()` (60 s signed URL). Nothing here is app-encrypted any more —
 * confidentiality relies on the private bucket, the deny-all storage RLS
 * (supabase/storage.sql), the service-role key staying server-side, and Supabase's
 * at-rest encryption. See DEPLOY.md "Document storage".
 */

export const MAX_DOC_BYTES = 20 * 1024 * 1024 // 20 MB — bucket file_size_limit matches
export const ALLOWED_MIME  = ['application/pdf', 'image/jpeg', 'image/png'] as const
export type AllowedMime    = typeof ALLOWED_MIME[number]

export type DocumentPurpose = 'kyb' | 'credit_score' | 'kyc'

/**
 * Per-purpose allowlist. KYB / credit-score docs feed Claude's PDF extraction, so
 * they are PDF-only; KYC identity docs may be photos.
 */
export const PURPOSE_RULES: Record<DocumentPurpose, { fields: readonly string[]; mime: readonly AllowedMime[] }> = {
  kyb:          { fields: ['incorporation', 'articles', 'shareholders'],          mime: ['application/pdf'] },
  credit_score: { fields: ['balance_sheet', 'income_statement', 'cash_flow'],     mime: ['application/pdf'] },
  kyc:          { fields: ['governmentId', 'proofOfAddress', 'rutDocument'],      mime: ['application/pdf', 'image/jpeg', 'image/png'] },
}

/** Hard cap on document rows per submission — stops a client minting unlimited intents. */
const MAX_DOCS_PER_PARENT = 30

/** Signed admin download URL lifetime (seconds). */
export const DOWNLOAD_URL_TTL_SECONDS = 60

/** Supabase signed upload URLs are fixed at 2 h by Storage. */
export const UPLOAD_URL_TTL_SECONDS = 2 * 60 * 60

/** Shared body for every `POST /verification/<flow>/upload-url`. */
export const uploadIntentBodySchema = z.object({
  filename:  z.string().trim().min(1).max(255),
  mimeType:  z.enum(ALLOWED_MIME),
  sizeBytes: z.number().int().positive().max(MAX_DOC_BYTES, `Document exceeds the ${MAX_DOC_BYTES / 1024 / 1024} MB limit.`),
})
export type UploadIntentBody = z.infer<typeof uploadIntentBodySchema>

export const documentIdParamsSchema = z.object({ documentId: z.string().min(1).max(64) })

export type DocumentParent =
  | { kybSubmissionId: string }
  | { kycSubmissionId: string }
  | { creditScoreRequestId: string }

export interface CreateUploadIntentInput extends UploadIntentBody {
  userId:    string
  purpose:   DocumentPurpose
  fieldName: string
  parent:    DocumentParent
}

export interface UploadIntent {
  documentId: string
  upload: {
    bucket:    string
    path:      string
    token:     string
    /** Full PUT target — `<SUPABASE_URL>/storage/v1/object/upload/sign/<bucket>/<path>?token=…` */
    signedUrl: string
    expiresIn: number
    /** Headers the client must send with the PUT. */
    headers:   Record<string, string>
  }
}

// ─── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Storage keys allow a narrow charset; keep the original filename on the row and
 * use a sanitised version in the key. Never empty, max 100 chars.
 */
export function safeObjectName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-100)
  return cleaned || 'document'
}

export function buildStoragePath(userId: string, parentId: string, filename: string): string {
  return `${userId}/${parentId}/${randomUUID()}-${safeObjectName(filename)}`
}

/** Returns the MIME type implied by the file's first bytes, or null if unknown. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}

function parentWhere(parent: DocumentParent) {
  if ('kybSubmissionId' in parent) return { kybSubmissionId: parent.kybSubmissionId }
  if ('kycSubmissionId' in parent) return { kycSubmissionId: parent.kycSubmissionId }
  return { creditScoreRequestId: parent.creditScoreRequestId }
}

function parentId(parent: DocumentParent): string {
  if ('kybSubmissionId' in parent) return parent.kybSubmissionId
  if ('kycSubmissionId' in parent) return parent.kycSubmissionId
  return parent.creditScoreRequestId
}

// ─── Upload intent ────────────────────────────────────────────────────────────

export async function createUploadIntent(input: CreateUploadIntentInput): Promise<UploadIntent> {
  const rules = PURPOSE_RULES[input.purpose]
  if (!rules.fields.includes(input.fieldName)) {
    throw new BadRequestError(`Invalid document type "${input.fieldName}" for ${input.purpose}.`)
  }
  if (!rules.mime.includes(input.mimeType)) {
    throw new BadRequestError(`MIME type not allowed for ${input.purpose}: ${input.mimeType}`)
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_DOC_BYTES) {
    throw new BadRequestError(`Document exceeds the ${MAX_DOC_BYTES / 1024 / 1024} MB limit.`)
  }

  const existing = await db.submissionDocument.count({ where: parentWhere(input.parent) })
  if (existing >= MAX_DOCS_PER_PARENT) {
    throw new BadRequestError('Too many documents on this submission.')
  }

  const storagePath = buildStoragePath(input.userId, parentId(input.parent), input.filename)

  // Ask Storage first: if it fails we have no orphan row.
  const { data, error } = await documentsBucket().createSignedUploadUrl(storagePath, { upsert: false })
  if (error || !data) {
    logger.error({ err: error?.message, storagePath }, 'document.signed_upload_failed')
    throw new Error('Could not create an upload URL. Please try again.')
  }

  const row = await db.submissionDocument.create({
    data: {
      userId:    input.userId,
      fieldName: input.fieldName,
      filename:  input.filename,
      mimeType:  input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath,
      status:    'PENDING',
      ...parentWhere(input.parent),
    },
    select: { id: true },
  })

  logger.info(
    { documentId: row.id, purpose: input.purpose, fieldName: input.fieldName, sizeBytes: input.sizeBytes },
    'document.intent_created',
  )

  return {
    documentId: row.id,
    upload: {
      bucket:    env.SUPABASE_STORAGE_BUCKET,
      path:      data.path,
      token:     data.token,
      signedUrl: data.signedUrl,
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      headers:   { 'content-type': input.mimeType, 'x-upsert': 'false' },
    },
  }
}

// ─── Confirm ──────────────────────────────────────────────────────────────────

export interface ConfirmedDocument {
  documentId:           string
  fieldName:            string
  filename:             string
  mimeType:             string
  sizeBytes:            number
  sha256:               string
  kybSubmissionId:      string | null
  kycSubmissionId:      string | null
  creditScoreRequestId: string | null
  buffer:               Buffer
}

/**
 * Verifies the uploaded object and marks the row UPLOADED. Idempotent: a second
 * confirm re-verifies and returns the bytes again (used to retry extraction).
 *
 * On a verification failure the object is removed and the row deleted, so the
 * client starts over with a fresh intent.
 */
export async function confirmUpload(userId: string, documentId: string, purpose: DocumentPurpose): Promise<ConfirmedDocument> {
  const row = await db.submissionDocument.findFirst({
    where:  { id: documentId, userId },
    select: {
      id: true, fieldName: true, filename: true, mimeType: true, sizeBytes: true,
      storagePath: true, status: true,
      kybSubmissionId: true, kycSubmissionId: true, creditScoreRequestId: true,
    },
  })
  if (!row) throw new NotFoundError('SubmissionDocument')
  if (!PURPOSE_RULES[purpose].fields.includes(row.fieldName)) {
    throw new BadRequestError('Document does not belong to this flow.')
  }

  const { data, error } = await documentsBucket().download(row.storagePath)
  if (error || !data) {
    // Most likely the PUT has not finished / never happened. Keep the row so the
    // client can still complete the upload with its signed URL.
    throw new ConflictError('Upload not found in storage yet — finish uploading the file, then confirm.')
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  const storedType = (data.type || '').split(';')[0].trim().toLowerCase()
  const sniffed = sniffMime(buffer)

  const problem =
    buffer.length !== row.sizeBytes ? `size mismatch (declared ${row.sizeBytes}, stored ${buffer.length})`
    : storedType && storedType !== row.mimeType ? `content-type mismatch (declared ${row.mimeType}, stored ${storedType})`
    : sniffed !== row.mimeType ? `file content is not a valid ${row.mimeType}`
    : null

  if (problem) {
    logger.warn({ documentId: row.id, problem }, 'document.confirm_rejected')
    await discard(row.id, row.storagePath)
    throw new BadRequestError(`Upload rejected: ${problem}. Please upload the file again.`)
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex')

  if (row.status !== 'UPLOADED') {
    await db.submissionDocument.update({
      where: { id: row.id },
      data:  { status: 'UPLOADED', sha256, uploadedAt: new Date() },
    })
    logger.info({ documentId: row.id, sizeBytes: buffer.length, sha256 }, 'document.uploaded')
  }

  return {
    documentId:           row.id,
    fieldName:            row.fieldName,
    filename:             row.filename,
    mimeType:             row.mimeType,
    sizeBytes:            buffer.length,
    sha256,
    kybSubmissionId:      row.kybSubmissionId,
    kycSubmissionId:      row.kycSubmissionId,
    creditScoreRequestId: row.creditScoreRequestId,
    buffer,
  }
}

// ─── Reads / downloads / delete ───────────────────────────────────────────────

/** Downloads an UPLOADED document with the service role (e.g. to re-run extraction). */
export async function readDocumentBuffer(documentId: string): Promise<{
  buffer:   Buffer
  filename: string
  mimeType: string
}> {
  const row = await db.submissionDocument.findUnique({
    where:  { id: documentId },
    select: { storagePath: true, filename: true, mimeType: true, status: true },
  })
  if (!row || row.status !== 'UPLOADED') throw new NotFoundError('SubmissionDocument')

  const { data, error } = await documentsBucket().download(row.storagePath)
  if (error || !data) throw new NotFoundError('Stored document')

  return { buffer: Buffer.from(await data.arrayBuffer()), filename: row.filename, mimeType: row.mimeType }
}

/** Short-lived signed download URL (admin review). The URL forces a download with the original filename. */
export async function createDownloadUrl(documentId: string, expiresIn = DOWNLOAD_URL_TTL_SECONDS): Promise<{
  url:       string
  filename:  string
  mimeType:  string
  sizeBytes: number
  expiresIn: number
}> {
  const row = await db.submissionDocument.findUnique({
    where:  { id: documentId },
    select: { storagePath: true, filename: true, mimeType: true, sizeBytes: true, status: true },
  })
  if (!row || row.status !== 'UPLOADED') throw new NotFoundError('Document')

  const { data, error } = await documentsBucket().createSignedUrl(row.storagePath, expiresIn, { download: row.filename })
  if (error || !data) {
    logger.error({ documentId, err: error?.message }, 'document.signed_download_failed')
    throw new Error('Could not create a download URL.')
  }
  return { url: data.signedUrl, filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes, expiresIn }
}

export async function deleteDocument(documentId: string): Promise<void> {
  const row = await db.submissionDocument.findUnique({ where: { id: documentId }, select: { storagePath: true } })
  if (!row) throw new NotFoundError('SubmissionDocument')
  await discard(documentId, row.storagePath)
}

async function discard(documentId: string, storagePath: string): Promise<void> {
  const { error } = await documentsBucket().remove([storagePath])
  if (error) logger.warn({ documentId, err: error.message }, 'document.storage_remove_failed')
  await db.submissionDocument.delete({ where: { id: documentId } })
  logger.info({ documentId }, 'document.deleted')
}

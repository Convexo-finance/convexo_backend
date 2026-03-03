import { createHash } from 'crypto'
import { Readable } from 'stream'
import PinataClient from '@pinata/sdk'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { BadRequestError, NotFoundError, ForbiddenError } from '../../shared/errors'
import type { DocumentCategory } from '@prisma/client'
import type { ListDocumentsInput } from './documents.schema'

// ─── Pinata upload ────────────────────────────────────────────────────────────

function getPinata(): PinataClient {
  if (!env.PINATA_JWT) throw new BadRequestError('Pinata is not configured.')
  return new PinataClient({ pinataJWTKey: env.PINATA_JWT })
}

export async function uploadDocument(
  userId: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  category: DocumentCategory,
) {
  const pinata   = getPinata()
  const stream   = Readable.from(fileBuffer) as NodeJS.ReadableStream
  const result   = await pinata.pinFileToIPFS(stream, {
    pinataMetadata: { name: `${userId}/${category}/${filename}` },
    pinataOptions:  { cidVersion: 1 },
  })

  const ipfsCid  = result.IpfsHash
  const ipfsUrl  = `https://${env.PINATA_GATEWAY}/ipfs/${ipfsCid}`
  const docHash  = createHash('sha256').update(fileBuffer).digest('hex')

  return db.document.create({
    data: {
      userId,
      filename,
      mimeType,
      sizeBytes:    fileBuffer.length,
      ipfsCid,
      ipfsUrl,
      documentHash: docHash,
      category,
    },
  })
}

// ─── List documents ───────────────────────────────────────────────────────────

export async function listDocuments(userId: string, query: ListDocumentsInput) {
  const where: Record<string, unknown> = { userId }
  if (query.category) where['category'] = query.category

  const [items, total] = await Promise.all([
    db.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
    }),
    db.document.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

// ─── Get one document ─────────────────────────────────────────────────────────

export async function getDocument(userId: string, id: string) {
  const doc = await db.document.findUnique({ where: { id } })
  if (!doc) throw new NotFoundError('Document')
  if (doc.userId !== userId) throw new ForbiddenError()
  return doc
}

// ─── Delete document (DB only — IPFS is immutable) ───────────────────────────

export async function deleteDocument(userId: string, id: string): Promise<void> {
  const doc = await db.document.findUnique({ where: { id } })
  if (!doc) throw new NotFoundError('Document')
  if (doc.userId !== userId) throw new ForbiddenError()
  await db.document.delete({ where: { id } })
}

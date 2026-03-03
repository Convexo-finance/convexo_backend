import type { FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import type { DocumentCategory } from '@prisma/client'
import { uploadDocument, listDocuments, getDocument, deleteDocument } from './documents.service'
import { listDocumentsSchema } from './documents.schema'
import { BadRequestError } from '../../shared/errors'

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const MAX_SIZE_BYTES = 20 * 1024 * 1024   // 20 MB

export async function upload(request: FastifyRequest, reply: FastifyReply) {
  const parts = request.parts()

  let fileBuffer: Buffer | null = null
  let filename                  = 'document'
  let mimeType                  = 'application/octet-stream'
  let category: DocumentCategory = 'GENERAL'

  for await (const part of parts) {
    if (part.type === 'file') {
      const file = part as MultipartFile
      filename   = file.filename
      mimeType   = file.mimetype

      const chunks: Buffer[] = []
      for await (const chunk of file.file) {
        chunks.push(chunk)
      }
      fileBuffer = Buffer.concat(chunks)
    } else if (part.fieldname === 'category') {
      category = (part.value as string) as DocumentCategory
    }
  }

  if (!fileBuffer) throw new BadRequestError('No file provided.')
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new BadRequestError(`Unsupported file type: ${mimeType}`)
  }
  if (fileBuffer.length > MAX_SIZE_BYTES) {
    throw new BadRequestError('File exceeds 20 MB limit.')
  }

  const doc = await uploadDocument(
    request.user.sub,
    fileBuffer,
    filename,
    mimeType,
    category,
  )

  return reply.status(201).send(doc)
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const query  = listDocumentsSchema.parse(request.query)
  const result = await listDocuments(request.user.sub, query)
  return reply.send(result)
}

export async function getOne(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const doc = await getDocument(request.user.sub, request.params.id)
  return reply.send(doc)
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await deleteDocument(request.user.sub, request.params.id)
  return reply.status(204).send()
}

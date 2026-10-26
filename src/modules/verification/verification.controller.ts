import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../../config/database'
import { getAllVerificationsStatus } from './verification.service'
import { createVeriffSession, getKycStatus } from './veriff.service'
import { createSumsubApplicant, getKybStatus } from './sumsub.service'
import { getCreditScoreStatus } from './credit-score.service'
import { createKycUploadIntent, confirmKycDocument, submitKyc } from './kyc-submit.service'
import { startKycSchema, startKybSchema, kycUploadUrlSchema } from './verification.schema'
import { uploadIntentBodySchema, documentIdParamsSchema } from '../../shared/document-store'

// ─── GET /verification/status ─────────────────────────────────────────────────

export async function getStatus(request: FastifyRequest, reply: FastifyReply) {
  const statuses = await getAllVerificationsStatus(request.user.sub)
  return reply.send(statuses)
}

// ─── POST /verification/kyc/start (Individual only) ──────────────────────────

export async function startKyc(request: FastifyRequest, reply: FastifyReply) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: request.user.sub },
    include: { individualProfile: true },
  })

  const body = startKycSchema.parse(request.body)

  const result = await createVeriffSession({
    userId: user.id,
    walletAddress: user.walletAddress,
    firstName: body.firstName ?? user.individualProfile?.firstName ?? undefined,
    lastName:  body.lastName  ?? user.individualProfile?.lastName  ?? undefined,
  })

  return reply.status(201).send(result)
}

// ─── GET /verification/kyc/status (Individual only) ──────────────────────────

export async function getKycStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await getKycStatus(request.user.sub)
  return reply.send(result)
}

// ─── POST /verification/kyb/start (Business only) ────────────────────────────

export async function startKyb(request: FastifyRequest, reply: FastifyReply) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: request.user.sub },
    include: { businessProfile: true },
  })

  const body = startKybSchema.parse(request.body)

  const result = await createSumsubApplicant({
    userId:        user.id,
    walletAddress: user.walletAddress,
    email:         user.businessProfile?.email ?? undefined,
    levelName:     body.levelName,
  })

  return reply.status(201).send(result)
}

// ─── GET /verification/kyb/status (Business only) ────────────────────────────

export async function getKybStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await getKybStatus(request.user.sub)
  return reply.send(result)
}

// ─── GET /verification/credit-score/status (Business only) ───────────────────

export async function getCreditScoreStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await getCreditScoreStatus(request.user.sub)
  return reply.send(result)
}

// ─── POST /verification/kyc/upload-url (Individual only) ─────────────────────
// Files go straight to Supabase Storage via the returned signed URL.

export async function kycUploadUrlHandler(request: FastifyRequest, reply: FastifyReply) {
  const { fieldName, ...body } = uploadIntentBodySchema.merge(kycUploadUrlSchema).parse(request.body)
  const intent = await createKycUploadIntent(request.user.sub, fieldName, body)
  return reply.status(201).send(intent)
}

// ─── POST /verification/kyc/documents/:documentId/confirm (Individual only) ──

export async function kycConfirmHandler(request: FastifyRequest, reply: FastifyReply) {
  const { documentId } = documentIdParamsSchema.parse(request.params)
  const result = await confirmKycDocument(request.user.sub, documentId)
  return reply.send(result)
}

// ─── POST /verification/kyc/submit (Individual only) ─────────────────────────
// JSON, no body: finalises the DRAFT built from confirmed uploads.

export async function submitKycHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await db.user.findUniqueOrThrow({ where: { id: request.user.sub } })
  const result = await submitKyc(user.id, user.walletAddress)
  return reply.status(201).send(result)
}

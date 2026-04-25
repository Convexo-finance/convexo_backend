import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  listUsers,
  getUserDetails,
  grantAdminRole,
  revokeAdminRole,
  listAllVerifications,
  overrideVerification,
  recordVerificationNft,
  listAllCreditScoreRequests,
  adminOverrideCreditScore,
  recordCreditScoreNft,
  listKybSubmissions,
  getKybSubmission,
  reviewKybSubmission,
  listKycSubmissions,
  getKycSubmission,
  reviewKycSubmission,
  getSubmissionDocument,
} from './admin.service'
import {
  listUsersSchema,
  grantAdminRoleSchema,
  overrideVerificationSchema,
  recordNftSchema,
  overrideCreditScoreSchema,
  listSubmissionsSchema,
  reviewSubmissionSchema,
} from './admin.schema'

// ─── Users ────────────────────────────────────────────────────────────────────

export async function listUsersHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listUsersSchema.parse(request.query)
  return reply.send(await listUsers(query))
}

export async function getUserHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  return reply.send(await getUserDetails(request.params.id))
}

// ─── Admin roles ──────────────────────────────────────────────────────────────

export async function grantRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = grantAdminRoleSchema.parse(request.body)
  const role  = await grantAdminRole(request.user.sub, input)
  return reply.status(201).send(role)
}

export async function revokeRoleHandler(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) {
  await revokeAdminRole(request.params.userId, request.user.sub)
  return reply.status(204).send()
}

// ─── Verifications ────────────────────────────────────────────────────────────

const listVerificationsSchema = z.object({
  type:   z.string().optional(),
  status: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function listVerificationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listVerificationsSchema.parse(request.query)
  return reply.send(await listAllVerifications(query))
}

export async function overrideVerificationHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input   = overrideVerificationSchema.parse(request.body)
  const updated = await overrideVerification(request.params.id, request.user.sub, input)
  return reply.send(updated)
}

export async function recordVerificationNftHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input   = recordNftSchema.parse(request.body)
  const updated = await recordVerificationNft(request.params.id, request.user.sub, input)
  return reply.send(updated)
}

// ─── Credit Score ─────────────────────────────────────────────────────────────

const listCreditScoreSchema = z.object({
  status: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function listCreditScoreRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listCreditScoreSchema.parse(request.query)
  return reply.send(await listAllCreditScoreRequests(query))
}

export async function overrideCreditScoreHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input   = overrideCreditScoreSchema.parse(request.body)
  const updated = await adminOverrideCreditScore(request.params.id, request.user.sub, input)
  return reply.send(updated)
}

export async function recordCreditScoreNftHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { nftTokenId } = recordNftSchema.parse(request.body)
  const updated = await recordCreditScoreNft(request.params.id, nftTokenId)
  return reply.send(updated)
}

// ─── KYB Submissions ──────────────────────────────────────────────────────────

export async function listKybHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listSubmissionsSchema.parse(request.query)
  return reply.send(await listKybSubmissions(query))
}

export async function getKybHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  return reply.send(await getKybSubmission(request.params.id))
}

export async function reviewKybHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input   = reviewSubmissionSchema.parse(request.body)
  const updated = await reviewKybSubmission(request.params.id, request.user.sub, input)
  return reply.send(updated)
}

// ─── KYC Submissions ──────────────────────────────────────────────────────────

export async function listKycHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listSubmissionsSchema.parse(request.query)
  return reply.send(await listKycSubmissions(query))
}

export async function getKycHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  return reply.send(await getKycSubmission(request.params.id))
}

export async function reviewKycHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input   = reviewSubmissionSchema.parse(request.body)
  const updated = await reviewKycSubmission(request.params.id, request.user.sub, input)
  return reply.send(updated)
}

// ─── Document download ────────────────────────────────────────────────────────

export async function downloadDocumentHandler(
  request: FastifyRequest<{ Params: { docId: string } }>,
  reply: FastifyReply,
) {
  const doc = await getSubmissionDocument(request.params.docId)
  return reply
    .header('Content-Type', doc.mimeType)
    .header('Content-Disposition', `attachment; filename="${doc.filename}"`)
    .header('Content-Length', String(doc.sizeBytes))
    .send(doc.content)
}

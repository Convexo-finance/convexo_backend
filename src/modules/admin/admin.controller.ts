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
} from './admin.service'
import {
  listUsersSchema,
  grantAdminRoleSchema,
  overrideVerificationSchema,
  recordNftSchema,
  overrideCreditScoreSchema,
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

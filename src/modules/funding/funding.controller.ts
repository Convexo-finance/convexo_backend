import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../../config/database'
import {
  createFundingRequest,
  listMyFundingRequests,
  getMyFundingRequest,
  listAllFundingRequests,
  reviewFundingRequest,
  createFiatToEcop,
  createEcopToFiat,
} from './funding.service'
import {
  createFundingRequestSchema,
  reviewFundingRequestSchema,
  listFundingRequestsSchema,
  fiatToEcopSchema,
  ecopToFiatSchema,
} from './funding.schema'

// ─── User ─────────────────────────────────────────────────────────────────────

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const input = createFundingRequestSchema.parse(request.body)
  const user  = await db.user.findUniqueOrThrow({ where: { id: request.user.sub } })
  const req   = await createFundingRequest(request.user.sub, user.walletAddress, input)
  return reply.status(201).send(req)
}

export async function listMine(request: FastifyRequest, reply: FastifyReply) {
  const query  = listFundingRequestsSchema.parse(request.query)
  const result = await listMyFundingRequests(request.user.sub, query)
  return reply.send(result)
}

export async function getMine(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const req = await getMyFundingRequest(request.user.sub, request.params.id)
  return reply.send(req)
}

export async function fiatToEcop(request: FastifyRequest, reply: FastifyReply) {
  const input = fiatToEcopSchema.parse(request.body)
  const result = await createFiatToEcop(request.user.sub, input)
  return reply.status(201).send(result)
}

export async function ecopToFiat(request: FastifyRequest, reply: FastifyReply) {
  const input = ecopToFiatSchema.parse(request.body)
  const result = await createEcopToFiat(request.user.sub, input)
  return reply.status(201).send(result)
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function listAll(request: FastifyRequest, reply: FastifyReply) {
  const query  = listFundingRequestsSchema.parse(request.query)
  const result = await listAllFundingRequests(query)
  return reply.send(result)
}

export async function review(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input   = reviewFundingRequestSchema.parse(request.body)
  const updated = await reviewFundingRequest(request.params.id, request.user.sub, input)
  return reply.send(updated)
}

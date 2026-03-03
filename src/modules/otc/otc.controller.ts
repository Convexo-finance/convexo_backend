import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../../config/database'
import {
  createOtcOrder,
  listMyOtcOrders,
  getMyOtcOrder,
  listAllOtcOrders,
  updateOtcOrderStatus,
} from './otc.service'
import {
  createOtcOrderSchema,
  updateOtcOrderStatusSchema,
  listOtcOrdersSchema,
} from './otc.schema'

// ─── User ─────────────────────────────────────────────────────────────────────

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const input = createOtcOrderSchema.parse(request.body)
  const user  = await db.user.findUniqueOrThrow({ where: { id: request.user.sub } })
  const order = await createOtcOrder(request.user.sub, user.walletAddress, input)
  return reply.status(201).send(order)
}

export async function listMine(request: FastifyRequest, reply: FastifyReply) {
  const query = listOtcOrdersSchema.parse(request.query)
  const result = await listMyOtcOrders(request.user.sub, query)
  return reply.send(result)
}

export async function getMine(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const order = await getMyOtcOrder(request.user.sub, request.params.id)
  return reply.send(order)
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function listAll(request: FastifyRequest, reply: FastifyReply) {
  const query = listOtcOrdersSchema.parse(request.query)
  const result = await listAllOtcOrders(query)
  return reply.send(result)
}

export async function updateStatus(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input = updateOtcOrderStatusSchema.parse(request.body)
  const order = await updateOtcOrderStatus(request.params.id, input)
  return reply.send(order)
}

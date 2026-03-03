import type { FastifyRequest, FastifyReply } from 'fastify'
import { upsertRate, deleteRate, listRates, getRate } from './rates.service'
import { upsertRateSchema } from './rates.schema'

// ─── Public ───────────────────────────────────────────────────────────────────

export async function list(_request: FastifyRequest, reply: FastifyReply) {
  const rates = await listRates()
  return reply.send({ items: rates, total: rates.length })
}

export async function getOne(
  request: FastifyRequest<{ Params: { pair: string } }>,
  reply: FastifyReply,
) {
  const rate = await getRate(request.params.pair)
  return reply.send(rate)
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function upsert(request: FastifyRequest, reply: FastifyReply) {
  const input = upsertRateSchema.parse(request.body)
  const rate = await upsertRate(input)
  return reply.send(rate)
}

export async function remove(
  request: FastifyRequest<{ Params: { pair: string } }>,
  reply: FastifyReply,
) {
  await deleteRate(request.params.pair)
  return reply.status(204).send()
}

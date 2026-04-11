import type { FastifyRequest, FastifyReply } from 'fastify'
import { registerVault, listVaults, getVaultByAddress } from './vault.service'
import { registerVaultSchema, listVaultsSchema } from './vault.schema'

// ─── Public ───────────────────────────────────────────────────────────────────

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const query  = listVaultsSchema.parse(request.query)
  const result = await listVaults(query)
  return reply.send(result)
}

export async function getOne(
  request: FastifyRequest<{ Params: { address: string } }>,
  reply: FastifyReply,
) {
  const vault = await getVaultByAddress(request.params.address)
  return reply.send(vault)
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const input = registerVaultSchema.parse(request.body)
  const vault = await registerVault(input)
  return reply.status(201).send(vault)
}

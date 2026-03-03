import type { FastifyRequest, FastifyReply } from 'fastify'
import {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  setDefaultBankAccount,
} from './bank-accounts.service'
import { createBankAccountSchema, updateBankAccountSchema } from './bank-accounts.schema'

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const accounts = await listBankAccounts(request.user.sub)
  return reply.send({ items: accounts, total: accounts.length })
}

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const input = createBankAccountSchema.parse(request.body)
  const account = await createBankAccount(request.user.sub, input)
  return reply.status(201).send(account)
}

export async function update(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input = updateBankAccountSchema.parse(request.body)
  const account = await updateBankAccount(request.user.sub, request.params.id, input)
  return reply.send(account)
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await deleteBankAccount(request.user.sub, request.params.id)
  return reply.status(204).send()
}

export async function setDefault(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const account = await setDefaultBankAccount(request.user.sub, request.params.id)
  return reply.send(account)
}

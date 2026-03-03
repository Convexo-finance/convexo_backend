import type { FastifyRequest, FastifyReply } from 'fastify'
import {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  getContact,
} from './contacts.service'
import {
  createContactSchema,
  updateContactSchema,
  listContactsSchema,
} from './contacts.schema'

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const query = listContactsSchema.parse(request.query)
  const result = await listContacts(request.user.sub, query)
  return reply.send(result)
}

export async function getOne(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const contact = await getContact(request.user.sub, request.params.id)
  return reply.send(contact)
}

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const input = createContactSchema.parse(request.body)
  const contact = await createContact(request.user.sub, input)
  return reply.status(201).send(contact)
}

export async function update(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input = updateContactSchema.parse(request.body)
  const contact = await updateContact(request.user.sub, request.params.id, input)
  return reply.send(contact)
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await deleteContact(request.user.sub, request.params.id)
  return reply.status(204).send()
}

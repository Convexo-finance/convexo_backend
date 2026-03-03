import { db } from '../../config/database'
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors'
import type { CreateContactInput, UpdateContactInput, ListContactsInput } from './contacts.schema'

// ─── Service ──────────────────────────────────────────────────────────────────

export async function listContacts(userId: string, query: ListContactsInput) {
  const where: Record<string, unknown> = { userId }

  if (query.type) {
    where['type'] = query.type
  }

  if (query.search) {
    where['OR'] = [
      { name:    { contains: query.search, mode: 'insensitive' } },
      { address: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { name: 'asc' },
      skip:    query.offset,
      take:    query.limit,
    }),
    db.contact.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

export async function createContact(userId: string, input: CreateContactInput) {
  // Enforce unique address per user
  const existing = await db.contact.findUnique({
    where: { userId_address: { userId, address: input.address.toLowerCase() } },
  })
  if (existing) throw new ConflictError('A contact with this address already exists.')

  return db.contact.create({
    data: {
      userId,
      name:      input.name,
      address:   input.address.toLowerCase(),
      type:      input.type,
      notes:     input.notes,
      avatarUrl: input.avatarUrl,
    },
  })
}

export async function updateContact(userId: string, id: string, input: UpdateContactInput) {
  const contact = await db.contact.findUnique({ where: { id } })
  if (!contact) throw new NotFoundError('Contact')
  if (contact.userId !== userId) throw new ForbiddenError()

  return db.contact.update({ where: { id }, data: input })
}

export async function deleteContact(userId: string, id: string): Promise<void> {
  const contact = await db.contact.findUnique({ where: { id } })
  if (!contact) throw new NotFoundError('Contact')
  if (contact.userId !== userId) throw new ForbiddenError()

  await db.contact.delete({ where: { id } })
}

export async function getContact(userId: string, id: string) {
  const contact = await db.contact.findUnique({ where: { id } })
  if (!contact) throw new NotFoundError('Contact')
  if (contact.userId !== userId) throw new ForbiddenError()
  return contact
}

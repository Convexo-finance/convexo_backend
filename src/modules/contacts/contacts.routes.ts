import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { list, getOne, create, update, remove } from './contacts.controller'

export async function contactsRoutes(app: FastifyInstance) {
  const pre = [requireAuth]

  app.get('/contacts', {
    preHandler: pre,
    schema: { tags: ['Contacts'], summary: 'List contacts (searchable, filterable)' },
    handler: list,
  })

  app.get('/contacts/:id', {
    preHandler: pre,
    schema: { tags: ['Contacts'], summary: 'Get a single contact' },
    handler: getOne,
  })

  app.post('/contacts', {
    preHandler: pre,
    schema: { tags: ['Contacts'], summary: 'Create a contact' },
    handler: create,
  })

  app.put('/contacts/:id', {
    preHandler: pre,
    schema: { tags: ['Contacts'], summary: 'Update a contact' },
    handler: update,
  })

  app.delete('/contacts/:id', {
    preHandler: pre,
    schema: { tags: ['Contacts'], summary: 'Delete a contact' },
    handler: remove,
  })
}

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { list, create, update, remove, setDefault } from './bank-accounts.controller'

export async function bankAccountsRoutes(app: FastifyInstance) {
  const pre = [requireAuth]

  app.get('/bank-accounts', {
    preHandler: pre,
    schema: { tags: ['Bank Accounts'], summary: 'List all bank accounts for current user' },
    handler: list,
  })

  app.post('/bank-accounts', {
    preHandler: pre,
    schema: { tags: ['Bank Accounts'], summary: 'Add a new bank account' },
    handler: create,
  })

  app.put('/bank-accounts/:id', {
    preHandler: pre,
    schema: { tags: ['Bank Accounts'], summary: 'Update a bank account' },
    handler: update,
  })

  app.delete('/bank-accounts/:id', {
    preHandler: pre,
    schema: { tags: ['Bank Accounts'], summary: 'Delete a bank account' },
    handler: remove,
  })

  app.post('/bank-accounts/:id/default', {
    preHandler: pre,
    schema: { tags: ['Bank Accounts'], summary: 'Set a bank account as default' },
    handler: setDefault,
  })
}

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { usersController } from './users.controller'

export async function usersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /users/me
  app.get('/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Get authenticated user profile',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.getMe,
  })

  // PUT /users/me
  app.put('/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Update user settings',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.updateMe,
  })

  // DELETE /users/me
  app.delete('/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Delete account (GDPR)',
      security: [{ bearerAuth: [] }],
    },
    handler: usersController.deleteMe,
  })
}

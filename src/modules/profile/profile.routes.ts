import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { profileController } from './profile.controller'

export async function profileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /profile
  app.get('/profile', {
    schema: {
      tags: ['Profile'],
      summary: 'Get profile (Individual or Business based on account type)',
      security: [{ bearerAuth: [] }],
    },
    handler: profileController.getProfile,
  })

  // PUT /profile
  app.put('/profile', {
    schema: {
      tags: ['Profile'],
      summary: 'Update profile',
      security: [{ bearerAuth: [] }],
    },
    handler: profileController.updateProfile,
  })
}

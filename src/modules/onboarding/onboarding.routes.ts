import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { onboardingController } from './onboarding.controller'

export async function onboardingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /onboarding/status
  app.get('/onboarding/status', {
    schema: {
      tags: ['Onboarding'],
      summary: 'Get current onboarding step and next action',
      security: [{ bearerAuth: [] }],
    },
    handler: onboardingController.getStatus,
  })

  // POST /onboarding/type
  app.post('/onboarding/type', {
    schema: {
      tags: ['Onboarding'],
      summary: 'Set account type: INDIVIDUAL or BUSINESS',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['accountType'],
        properties: {
          accountType: { type: 'string', enum: ['INDIVIDUAL', 'BUSINESS'] },
        },
      },
    },
    handler: onboardingController.setType,
  })

  // POST /onboarding/profile
  app.post('/onboarding/profile', {
    schema: {
      tags: ['Onboarding'],
      summary: 'Submit profile (Individual or Business based on accountType)',
      security: [{ bearerAuth: [] }],
    },
    handler: onboardingController.submitProfile,
  })

  // POST /onboarding/complete
  app.post('/onboarding/complete', {
    schema: {
      tags: ['Onboarding'],
      summary: 'Mark onboarding as complete',
      security: [{ bearerAuth: [] }],
    },
    handler: onboardingController.complete,
  })
}

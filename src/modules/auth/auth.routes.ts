import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { buildAuthController } from './auth.controller'

export async function authRoutes(app: FastifyInstance) {
  const ctrl = buildAuthController(app)

  // GET /auth/nonce?address=0x...
  app.get('/auth/nonce', {
    schema: {
      tags: ['Auth'],
      summary: 'Get SIWE nonce for a wallet address',
      querystring: {
        type: 'object',
        required: ['address'],
        properties: {
          address: { type: 'string' },
        },
      },
    },
    handler: ctrl.getNonce,
  })

  // POST /auth/verify
  app.post('/auth/verify', {
    schema: {
      tags: ['Auth'],
      summary: 'Verify SIWE signature and issue JWT',
      body: {
        type: 'object',
        required: ['message', 'signature', 'address'],
        properties: {
          message: { type: 'string' },
          signature: { type: 'string' },
          address: { type: 'string' },
          chainId: { type: 'number' },
          authMethod: { type: 'string' },
          smartAccount: { type: 'string' },
        },
      },
    },
    handler: ctrl.verify,
  })

  // POST /auth/logout
  app.post('/auth/logout', {
    schema: {
      tags: ['Auth'],
      summary: 'Invalidate JWT token',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [requireAuth],
    handler: ctrl.logout,
  })
}

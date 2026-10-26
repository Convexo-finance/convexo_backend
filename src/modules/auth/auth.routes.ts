import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { buildAuthController } from './auth.controller'

export async function authRoutes(app: FastifyInstance) {
  const ctrl = buildAuthController(app)

  // Stricter than the global 100/min: these are unauthenticated and /verify can
  // trigger an RPC call (EIP-1271/6492 fallback).
  const authRateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } }

  // GET /auth/nonce?address=0x...
  app.get('/auth/nonce', {
    config: authRateLimit,
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
    config: authRateLimit,
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

  // POST /auth/refresh
  app.post('/auth/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Refresh access token using a valid refresh token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
    handler: ctrl.refresh,
  })

  // POST /auth/logout
  app.post('/auth/logout', {
    schema: {
      tags: ['Auth'],
      summary: 'Revoke this access token (and the refresh token, if sent)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        nullable: true,
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
    preHandler: [requireAuth],
    handler: ctrl.logout,
  })
}

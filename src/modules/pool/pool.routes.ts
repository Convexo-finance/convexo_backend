import type { FastifyInstance } from 'fastify'
import { getDefaultPoolStatus, getChainPoolStatus } from './pool.controller'

export async function poolRoutes(app: FastifyInstance) {
  // ─── Public — no auth required (read-only on-chain data) ─────────────────────

  app.get('/pool/status', {
    schema: {
      tags: ['Pool'],
      summary: 'Get pool status for the default monitored chain',
      description:
        'Returns USDC/ECOP pool price status, deviation from oracle, and reserve balances. ' +
        'Reads from Redis cache (60s TTL) and falls back to on-chain read.',
    },
    handler: getDefaultPoolStatus,
  })

  app.get('/pool/status/:chainId', {
    schema: {
      tags: ['Pool'],
      summary: 'Get pool status for a specific chain',
      description:
        'Returns USDC/ECOP pool price status for the given chainId. ' +
        'Reads from Redis cache (60s TTL) and falls back to on-chain read.',
      params: {
        type: 'object',
        properties: {
          chainId: { type: 'string', description: 'Chain ID (e.g. 1301, 130, 8453)' },
        },
        required: ['chainId'],
      },
    },
    handler: getChainPoolStatus,
  })
}

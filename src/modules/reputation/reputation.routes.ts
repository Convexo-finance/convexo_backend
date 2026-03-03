import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAuth } from '../../middleware/requireAuth'
import { syncReputation, getReputation } from './reputation.service'

export async function reputationRoutes(app: FastifyInstance) {
  // GET /reputation — return cached tier data for the current user
  app.get('/reputation', {
    preHandler: [requireAuth],
    schema: { tags: ['Reputation'], summary: 'Get cached NFT reputation for current user' },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const cache = await getReputation(request.user.sub)
      return reply.send(cache)
    },
  })

  // POST /reputation/sync — re-read NFT balances from chain and update cache
  app.post('/reputation/sync', {
    preHandler: [requireAuth],
    schema: { tags: ['Reputation'], summary: 'Sync NFT balances from chain and update reputation cache' },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as { chainId?: number }
      const chainId = body.chainId ?? request.user.chainId ?? 8453
      const cache = await syncReputation(request.user.sub, chainId as number)
      return reply.send(cache)
    },
  })
}

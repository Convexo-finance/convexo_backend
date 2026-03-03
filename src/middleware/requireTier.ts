import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../config/database'

export function requireTier(minTier: number) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const reputation = await db.reputationCache.findUnique({
      where: { userId: request.user.sub },
      select: { tier: true },
    })

    const tier = reputation?.tier ?? 0

    if (tier < minTier) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Tier ${minTier} NFT required. Your current tier is ${tier}.`,
        currentTier: tier,
        requiredTier: minTier,
        redirectTo: '/digital-id',
      })
    }
  }
}

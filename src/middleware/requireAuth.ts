import type { FastifyRequest, FastifyReply } from 'fastify'
import { redis, RedisKeys } from '../config/redis'
import { UnauthorizedError } from '../shared/errors'

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()

    // Check if token is blacklisted (logout)
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (token) {
      const jti = request.user.sub
      const isBlacklisted = await redis.get(RedisKeys.jwtBlacklist(jti))
      if (isBlacklisted) {
        throw new UnauthorizedError('Token has been revoked')
      }
    }
  } catch (err) {
    const error = err instanceof UnauthorizedError ? err : new UnauthorizedError('Invalid or expired token')
    reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: 'Unauthorized',
      message: error.message,
    })
  }
}

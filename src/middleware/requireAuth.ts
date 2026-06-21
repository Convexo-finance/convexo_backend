import type { FastifyRequest, FastifyReply } from 'fastify'
import { redis, RedisKeys } from '../config/redis'
import { UnauthorizedError } from '../shared/errors'

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()

    // Refresh tokens must not authorize protected routes (auth audit fix).
    if (request.user.tokenType === 'refresh') {
      throw new UnauthorizedError('Refresh token cannot be used for authentication')
    }

    // Per-token revocation: blacklist is keyed by the token's own jti, set on
    // logout. (Previously keyed by userId — which then rejected the user's next
    // login for 30 days. Fixed 2026-06-19.)
    const jti = request.user.jti
    if (jti) {
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

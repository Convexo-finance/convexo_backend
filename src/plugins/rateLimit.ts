import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import { redis } from '../config/redis'

export default fp(async (app) => {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please wait before retrying.',
    }),
  })
})

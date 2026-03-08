import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { env } from '../config/env'

export default fp(async (app) => {
  await app.register(cors, {
    // Reflect any origin back — access is controlled by JWT auth, not CORS.
    // This allows local dev, staging, and any frontend domain to connect.
    origin: (origin, cb) => cb(null, origin ?? '*'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
})

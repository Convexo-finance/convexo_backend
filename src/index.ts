import 'dotenv/config'
import { buildApp } from './app'
import { env } from './config/env'
import { connectDatabase, disconnectDatabase } from './config/database'
import { redis } from './config/redis'
import { logger } from './shared/logger'

async function start() {
  const app = await buildApp()

  try {
    // Connect DB + Redis
    await connectDatabase()
    logger.info('✅ PostgreSQL connected')

    await redis.connect()
    logger.info('✅ Redis connected')

    // Start server
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    logger.info(`🚀 Server running at ${env.APP_URL}`)

    if (env.NODE_ENV !== 'production') {
      logger.info(`📖 API docs at ${env.APP_URL}/docs`)
    }
  } catch (err) {
    logger.error(err, 'Failed to start server')
    process.exit(1)
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`)
  try {
    await disconnectDatabase()
    await redis.quit()
    logger.info('Shutdown complete')
    process.exit(0)
  } catch (err) {
    logger.error(err, 'Error during shutdown')
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start()

import Fastify, { type FastifyRequest } from 'fastify'
import { env } from './config/env'
import { AppError } from './shared/errors'
import './types'

// Plugins
import corsPlugin from './plugins/cors'
import rateLimitPlugin from './plugins/rateLimit'
import multipartPlugin from './plugins/multipart'
import swaggerPlugin from './plugins/swagger'
import authPlugin from './plugins/auth'

// Routes
import { authRoutes } from './modules/auth/auth.routes'
import { usersRoutes } from './modules/users/users.routes'
import { onboardingRoutes } from './modules/onboarding/onboarding.routes'
import { profileRoutes } from './modules/profile/profile.routes'
import { verificationRoutes } from './modules/verification/verification.routes'
import { bankAccountsRoutes } from './modules/bank-accounts/bank-accounts.routes'
import { contactsRoutes } from './modules/contacts/contacts.routes'
import { ratesRoutes } from './modules/rates/rates.routes'
import { otcRoutes } from './modules/otc/otc.routes'
import { documentsRoutes } from './modules/documents/documents.routes'
import { reputationRoutes } from './modules/reputation/reputation.routes'
import { fundingRoutes } from './modules/funding/funding.routes'
import { adminRoutes } from './modules/admin/admin.routes'

// Webhooks
import { veriffWebhookRoutes } from './webhooks/veriff.webhook'
import { sumsubWebhookRoutes } from './webhooks/sumsub.webhook'
import { n8nWebhookRoutes } from './webhooks/n8n.webhook'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  // ─── Raw body capture (needed for webhook HMAC verification) ─────────────────
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    ;(req as FastifyRequest).rawBody = body as Buffer
    try {
      done(null, JSON.parse((body as Buffer).toString()))
    } catch (err) {
      const parseErr = new Error('Invalid JSON body')
      ;(parseErr as Error & { statusCode: number }).statusCode = 400
      done(parseErr as Error, undefined)
    }
  })

  // ─── Plugins ────────────────────────────────────────────────────────────────
  await app.register(swaggerPlugin)
  await app.register(corsPlugin)
  await app.register(rateLimitPlugin)
  await app.register(multipartPlugin)
  await app.register(authPlugin)

  // ─── Health check ────────────────────────────────────────────────────────────
  app.get('/health', {
    schema: { tags: ['System'], summary: 'Health check' },
    handler: async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: env.NODE_ENV,
    }),
  })

  // ─── Routes ──────────────────────────────────────────────────────────────────
  await app.register(authRoutes)
  await app.register(usersRoutes)
  await app.register(onboardingRoutes)
  await app.register(profileRoutes)
  await app.register(verificationRoutes)
  await app.register(bankAccountsRoutes)
  await app.register(contactsRoutes)
  await app.register(ratesRoutes)
  await app.register(otcRoutes)
  await app.register(documentsRoutes)
  await app.register(reputationRoutes)
  await app.register(fundingRoutes)
  await app.register(adminRoutes)

  // Webhooks (no auth middleware — verified by HMAC/Bearer internally)
  await app.register(veriffWebhookRoutes)
  await app.register(sumsubWebhookRoutes)
  await app.register(n8nWebhookRoutes)

  // ─── Global error handler ────────────────────────────────────────────────────
  app.setErrorHandler((err: unknown, _request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        error: err.name,
        message: err.message,
        code: err.code,
      })
    }

    const error = err as Error & { statusCode?: number }

    // Zod validation errors
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: 'Invalid request data',
        details: JSON.parse(error.message),
      })
    }

    // Fastify validation errors
    if (error.statusCode === 400) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error.message,
      })
    }

    app.log.error(error)

    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message,
    })
  })

  return app
}

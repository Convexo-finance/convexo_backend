import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../config/env'
import { processCreditScoreCallback } from '../modules/verification/credit-score.service'
import { notifyCreditScoreResult } from '../modules/notifications/notifications.service'
import { logger } from '../shared/logger'

export async function n8nWebhookRoutes(app: FastifyInstance) {
  // ── POST /webhooks/n8n/credit-score ──────────────────────────────────────────
  app.post('/webhooks/n8n/credit-score', {
    schema: { tags: ['Webhooks'], summary: 'n8n credit score automation callback' },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      // ── Verify Bearer token ───────────────────────────────────────────────────
      if (env.N8N_WEBHOOK_SECRET) {
        const authHeader = request.headers['authorization'] ?? ''
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
        if (token !== env.N8N_WEBHOOK_SECRET) {
          logger.warn('n8n webhook: invalid Bearer token')
          return reply.status(401).send({ error: 'Unauthorized' })
        }
      }

      // ── Process callback ──────────────────────────────────────────────────────
      const payload = request.body as {
        requestId:        string
        approved:         boolean
        score:            number
        rating:           string
        maxCreditLimit?:  string
        analysisNotes?:   string
        rejectionReason?: string
        n8nExecutionId?:  string
      }

      if (!payload.requestId) {
        return reply.status(400).send({ error: 'requestId is required' })
      }

      const result = await processCreditScoreCallback(payload)

      // ── Notifications ─────────────────────────────────────────────────────────
      const email = result.email

      if (email) {
        await notifyCreditScoreResult(
          result.user.id,
          email,
          payload.approved,
          payload.score,
          payload.rating,
          payload.maxCreditLimit,
          payload.rejectionReason,
        ).catch((err) => logger.error({ err }, 'Failed to send credit score notification'))
      }

      logger.info(
        { requestId: payload.requestId, approved: payload.approved, score: payload.score },
        'n8n credit-score callback processed',
      )

      return reply.status(200).send({ received: true })
    },
  })
}

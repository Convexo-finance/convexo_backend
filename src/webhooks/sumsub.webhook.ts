import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { verifySumsubWebhook, processSumsubWebhook } from '../modules/verification/sumsub.service'
import {
  notifyVerificationApproved,
  notifyVerificationRejected,
  notifyAdminVerificationReady,
} from '../modules/notifications/notifications.service'
import { logger } from '../shared/logger'

export async function sumsubWebhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/sumsub', {
    schema: { tags: ['Webhooks'], summary: 'Sumsub KYB webhook' },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      // ── Verify HMAC signature ─────────────────────────────────────────────────
      const digest  = request.headers['x-payload-digest'] as string | undefined
      const rawBody = request.rawBody?.toString() ?? JSON.stringify(request.body)

      if (!verifySumsubWebhook(rawBody, digest ?? '')) {
        logger.warn('Sumsub webhook: invalid HMAC signature')
        return reply.status(401).send({ error: 'Invalid signature' })
      }

      // ── Process payload ───────────────────────────────────────────────────────
      const payload = request.body as {
        type:          string
        applicantId:   string
        applicantType: string
        correlationId: string
        externalUserId: string
        levelName:     string
        reviewStatus:  string
        reviewResult?: {
          reviewAnswer:     'GREEN' | 'RED'
          rejectLabels?:    string[]
          reviewRejectType?: string
          clientComment?:   string
        }
      }

      const result = await processSumsubWebhook(payload)

      if (!result) {
        return reply.status(200).send({ received: true })
      }

      if (result.skipped) {
        return reply.status(200).send({ received: true, skipped: true })
      }

      // ── Notifications ─────────────────────────────────────────────────────────
      const email = result.user?.businessProfile?.email
      const walletAddress = result.user?.walletAddress ?? ''

      if (result.newStatus === 'APPROVED' && email) {
        await notifyVerificationApproved(result.verification.userId, email, 'KYB_BUSINESS').catch(
          (err) => logger.error({ err }, 'Failed to send KYB approval email'),
        )
      }

      if (result.newStatus === 'REJECTED' && email) {
        await notifyVerificationRejected(
          result.verification.userId,
          email,
          'KYB_BUSINESS',
          result.verification.rejectionReason ?? undefined,
        ).catch((err) => logger.error({ err }, 'Failed to send KYB rejection email'))
      }

      if (result.newStatus === 'APPROVED') {
        await notifyAdminVerificationReady(
          result.verification.userId,
          walletAddress,
          'KYB_BUSINESS',
        ).catch((err) => logger.error({ err }, 'Failed to send admin KYB notification'))
      }

      logger.info(
        { applicantId: payload.applicantId, newStatus: result.newStatus },
        'Sumsub webhook processed',
      )

      return reply.status(200).send({ received: true })
    },
  })
}

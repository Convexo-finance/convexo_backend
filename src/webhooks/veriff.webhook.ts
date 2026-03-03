import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { verifyVeriffWebhook, processVeriffWebhook } from '../modules/verification/veriff.service'
import {
  notifyVerificationApproved,
  notifyVerificationRejected,
  notifyAdminVerificationReady,
} from '../modules/notifications/notifications.service'
import { logger } from '../shared/logger'

export async function veriffWebhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/veriff', {
    schema: { tags: ['Webhooks'], summary: 'Veriff verification webhook' },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      // ── Verify HMAC signature ─────────────────────────────────────────────────
      const signature = request.headers['x-hmac-signature'] as string | undefined
      const rawBody   = request.rawBody?.toString() ?? JSON.stringify(request.body)

      if (!verifyVeriffWebhook(rawBody, signature ?? '')) {
        logger.warn('Veriff webhook: invalid HMAC signature')
        return reply.status(401).send({ error: 'Invalid signature' })
      }

      // ── Process payload ───────────────────────────────────────────────────────
      const payload = request.body as {
        id:         string
        attemptId:  string
        feature:    string
        code:       number
        status:     'approved' | 'declined' | 'resubmission_requested' | 'expired'
        action:     string
        vendorData: string
        person?:    { firstName: string; lastName: string }
        technicalData?: { ip: string }
      }

      const result = await processVeriffWebhook(payload)

      if (!result) {
        return reply.status(200).send({ received: true })
      }

      // ── Notifications ─────────────────────────────────────────────────────────
      const email = result.user.individualProfile?.email
      const walletAddress = result.user.walletAddress

      if (result.newStatus === 'APPROVED' && email) {
        await notifyVerificationApproved(result.user.id, email, 'KYC_INDIVIDUAL').catch((err) =>
          logger.error({ err }, 'Failed to send KYC approval email'),
        )
      }

      if (result.newStatus === 'REJECTED' && email) {
        await notifyVerificationRejected(result.user.id, email, 'KYC_INDIVIDUAL').catch((err) =>
          logger.error({ err }, 'Failed to send KYC rejection email'),
        )
      }

      if (result.newStatus === 'RESUBMISSION_REQUESTED' && email) {
        await notifyVerificationRejected(
          result.user.id,
          email,
          'KYC_INDIVIDUAL',
          'Resubmission required',
        ).catch((err) => logger.error({ err }, 'Failed to send KYC resubmission email'))
      }

      // Notify admin that KYC is approved (for NFT minting)
      if (result.newStatus === 'APPROVED') {
        await notifyAdminVerificationReady(result.user.id, walletAddress, 'KYC_INDIVIDUAL').catch(
          (err) => logger.error({ err }, 'Failed to send admin KYC notification'),
        )
      }

      logger.info(
        { verificationId: result.verification.id, newStatus: result.newStatus },
        'Veriff webhook processed',
      )

      return reply.status(200).send({ received: true })
    },
  })
}

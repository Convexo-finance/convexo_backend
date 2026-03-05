import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import {
  generateNonce,
  verifySiweSignature,
  upsertUser,
  issueTokens,
  blacklistToken,
  verifyRefreshToken,
  checkRefreshRateLimit,
  findUserById,
} from './auth.service'
import {
  getNonceSchema,
  verifySchema,
  refreshSchema,
} from './auth.schema'

export function buildAuthController(app: FastifyInstance) {
  return {
    async getNonce(
      request: FastifyRequest<{ Querystring: { address: string } }>,
      reply: FastifyReply,
    ) {
      const { address } = getNonceSchema.parse(request.query)
      const nonce = await generateNonce(address)
      return reply.send({ nonce })
    },

    async verify(
      request: FastifyRequest,
      reply: FastifyReply,
    ) {
      const body = verifySchema.parse(request.body)

      await verifySiweSignature(body.message, body.signature, body.address)

      const user = await upsertUser(
        body.address,
        body.authMethod,
        body.chainId ?? 8453,
        body.smartAccount,
      )

      const tokens = issueTokens(app, user)

      return reply.send({
        ...tokens,
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          accountType: user.accountType,
          onboardingStep: user.onboardingStep,
          isAdmin: !!user.adminRole,
        },
      })
    },

    async logout(request: FastifyRequest, reply: FastifyReply) {
      await blacklistToken(request.user.sub)
      return reply.send({ success: true })
    },

    async refresh(request: FastifyRequest, reply: FastifyReply) {
      const { refreshToken } = refreshSchema.parse(request.body)

      // Verify the refresh token and extract payload
      const payload = verifyRefreshToken(app, refreshToken)

      // Rate limit: max 5 refresh calls per minute per user
      await checkRefreshRateLimit(payload.sub)

      // Re-fetch user to get latest data (role changes, onboarding progress, etc.)
      const user = await findUserById(payload.sub)

      const tokens = issueTokens(app, user)

      return reply.send({
        ...tokens,
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          accountType: user.accountType,
          onboardingStep: user.onboardingStep,
          isAdmin: !!user.adminRole,
        },
      })
    },
  }
}

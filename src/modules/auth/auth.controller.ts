import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import {
  generateNonce,
  verifySiweSignature,
  upsertUser,
  issueTokens,
  revokeDecodedToken,
  verifyRefreshToken,
  checkRefreshRateLimit,
  findUserById,
} from './auth.service'
import {
  getNonceSchema,
  verifySchema,
  refreshSchema,
  logoutSchema,
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

      // chainId comes from the *signed* message, not the client-supplied body.
      const { chainId } = await verifySiweSignature(body.message, body.signature, body.address)

      const user = await upsertUser(
        body.address,
        body.authMethod,
        chainId,
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
      // Revoke this access token (by jti) for its remaining lifetime, so the
      // user's next login is unaffected. If the client also sends its refresh
      // token, revoke that too — otherwise it would stay usable for 30 days.
      const { refreshToken } = logoutSchema.parse(request.body ?? {})
      await revokeDecodedToken(request.user)
      if (refreshToken) {
        try {
          const refresh = await verifyRefreshToken(app, refreshToken)
          if (refresh.sub === request.user.sub) await revokeDecodedToken(refresh)
        } catch {
          // Already invalid/expired/revoked — nothing to do.
        }
      }
      return reply.send({ success: true })
    },

    async refresh(request: FastifyRequest, reply: FastifyReply) {
      const { refreshToken } = refreshSchema.parse(request.body)

      // Verify the refresh token and extract payload
      const payload = await verifyRefreshToken(app, refreshToken)

      // Rate limit: max 5 refresh calls per minute per user
      await checkRefreshRateLimit(payload.sub)

      // Re-fetch user to get latest data (role changes, onboarding progress, etc.)
      const user = await findUserById(payload.sub)

      // Rotation: the presented refresh token is single-use. A replayed (stolen
      // or duplicated) refresh token is rejected by verifyRefreshToken above.
      await revokeDecodedToken(payload)

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

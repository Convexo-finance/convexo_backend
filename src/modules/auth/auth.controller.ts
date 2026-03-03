import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  generateNonce,
  verifySiweSignature,
  upsertUser,
  issueTokens,
  blacklistToken,
} from './auth.service'
import {
  getNonceSchema,
  verifySchema,
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
  }
}

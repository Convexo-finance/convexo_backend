import type { FastifyRequest, FastifyReply } from 'fastify'
import {
  getOnboardingStatus,
  setAccountType,
  submitIndividualProfile,
  submitBusinessProfile,
} from './onboarding.service'
import {
  setAccountTypeSchema,
  individualProfileSchema,
  businessProfileSchema,
} from './onboarding.schema'
import { db } from '../../config/database'
import { BadRequestError } from '../../shared/errors'

export const onboardingController = {
  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const status = await getOnboardingStatus(request.user.sub)
    return reply.send(status)
  },

  async setType(request: FastifyRequest, reply: FastifyReply) {
    const input = setAccountTypeSchema.parse(request.body)
    const result = await setAccountType(request.user.sub, input)
    return reply.send(result)
  },

  async submitProfile(request: FastifyRequest, reply: FastifyReply) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { accountType: true },
    })

    if (!user.accountType) {
      throw new BadRequestError('Account type must be set before submitting profile.')
    }

    if (user.accountType === 'INDIVIDUAL') {
      const input = individualProfileSchema.parse(request.body)
      const result = await submitIndividualProfile(request.user.sub, input)
      return reply.send(result)
    } else {
      const input = businessProfileSchema.parse(request.body)
      const result = await submitBusinessProfile(request.user.sub, input)
      return reply.send(result)
    }
  },

  async complete(request: FastifyRequest, reply: FastifyReply) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { onboardingStep: true },
    })

    const completableSteps = ['LP_COMPLETE', 'CREDIT_SCORE_PENDING', 'HUMANITY_COMPLETE']

    if (!completableSteps.includes(user.onboardingStep)) {
      throw new BadRequestError(
        `Cannot complete onboarding from step: ${user.onboardingStep}`,
      )
    }

    const updated = await db.user.update({
      where: { id: request.user.sub },
      data: {
        onboardingStep: 'COMPLETE',
        onboardedAt: new Date(),
      },
      select: { onboardingStep: true, onboardedAt: true },
    })

    return reply.send(updated)
  },
}

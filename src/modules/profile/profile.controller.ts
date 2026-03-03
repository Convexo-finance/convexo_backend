import type { FastifyRequest, FastifyReply } from 'fastify'
import { BadRequestError } from '../../shared/errors'
import {
  getIndividualProfile,
  updateIndividualProfile,
} from './individual.service'
import {
  getBusinessProfile,
  updateBusinessProfile,
} from './business.service'
import {
  updateIndividualSchema,
  updateBusinessSchema,
} from './profile.schema'

export const profileController = {
  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const { accountType } = request.user

    if (accountType === 'INDIVIDUAL') {
      return reply.send(await getIndividualProfile(request.user.sub))
    } else if (accountType === 'BUSINESS') {
      return reply.send(await getBusinessProfile(request.user.sub))
    }

    throw new BadRequestError('Account type not set. Complete onboarding first.')
  },

  async updateProfile(request: FastifyRequest, reply: FastifyReply) {
    const { accountType } = request.user

    if (accountType === 'INDIVIDUAL') {
      const data = updateIndividualSchema.parse(request.body)
      return reply.send(await updateIndividualProfile(request.user.sub, data))
    } else if (accountType === 'BUSINESS') {
      const data = updateBusinessSchema.parse(request.body)
      return reply.send(await updateBusinessProfile(request.user.sub, data))
    }

    throw new BadRequestError('Account type not set. Complete onboarding first.')
  },
}

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AccountType } from '@prisma/client'

export function requireAccountType(type: AccountType) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (request.user.accountType !== type) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `This endpoint is only available for ${type.toLowerCase()} accounts.`,
      })
    }
  }
}

export const requireIndividual = requireAccountType('INDIVIDUAL')
export const requireBusiness = requireAccountType('BUSINESS')

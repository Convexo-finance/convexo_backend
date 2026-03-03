import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AdminRoleType } from '@prisma/client'

const ROLE_HIERARCHY: Record<AdminRoleType, number> = {
  VIEWER: 1,
  VERIFIER: 2,
  SUPER_ADMIN: 3,
}

export function requireAdmin(minRole: AdminRoleType = 'VIEWER') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user.isAdmin || !request.user.adminRole) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Admin access required.',
      })
      return
    }

    const userLevel = ROLE_HIERARCHY[request.user.adminRole]
    const requiredLevel = ROLE_HIERARCHY[minRole]

    if (userLevel < requiredLevel) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Requires ${minRole} role or higher.`,
      })
    }
  }
}

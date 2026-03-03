import type { FastifyRequest, FastifyReply } from 'fastify'
import { getUserById, updateUser, deleteUser } from './users.service'
import { updateUserSchema } from './users.schema'

export const usersController = {
  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const user = await getUserById(request.user.sub)
    return reply.send(user)
  },

  async updateMe(request: FastifyRequest, reply: FastifyReply) {
    const data = updateUserSchema.parse(request.body)
    const user = await updateUser(request.user.sub, data)
    return reply.send(user)
  },

  async deleteMe(request: FastifyRequest, reply: FastifyReply) {
    await deleteUser(request.user.sub)
    return reply.status(204).send()
  },
}

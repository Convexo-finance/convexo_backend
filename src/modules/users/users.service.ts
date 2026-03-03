import { db } from '../../config/database'
import { NotFoundError } from '../../shared/errors'
import type { UpdateUserInput } from './users.schema'

export async function getUserById(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      individualProfile: true,
      businessProfile: true,
      reputation: true,
      adminRole: true,
    },
  })

  if (!user) throw new NotFoundError('User')
  return user
}

export async function updateUser(userId: string, data: UpdateUserInput) {
  return db.user.update({
    where: { id: userId },
    data,
    include: {
      individualProfile: true,
      businessProfile: true,
      reputation: true,
      adminRole: true,
    },
  })
}

export async function deleteUser(userId: string): Promise<void> {
  await db.user.findUniqueOrThrow({ where: { id: userId } })
  await db.user.delete({ where: { id: userId } })
}

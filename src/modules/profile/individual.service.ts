import { db } from '../../config/database'
import { NotFoundError } from '../../shared/errors'
import type { UpdateIndividualInput } from './profile.schema'

export async function getIndividualProfile(userId: string) {
  const profile = await db.individualProfile.findUnique({ where: { userId } })
  if (!profile) throw new NotFoundError('Individual profile')
  return profile
}

export async function updateIndividualProfile(
  userId: string,
  data: UpdateIndividualInput,
) {
  return db.individualProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })
}

export async function updateIndividualAvatar(userId: string, avatarUrl: string) {
  return db.individualProfile.upsert({
    where: { userId },
    create: { userId, avatarUrl },
    update: { avatarUrl },
  })
}

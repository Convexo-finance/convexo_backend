import { db } from '../../config/database'
import { NotFoundError } from '../../shared/errors'
import type { UpdateBusinessInput } from './profile.schema'

export async function getBusinessProfile(userId: string) {
  const profile = await db.businessProfile.findUnique({ where: { userId } })
  if (!profile) throw new NotFoundError('Business profile')
  return profile
}

export async function updateBusinessProfile(
  userId: string,
  data: UpdateBusinessInput,
) {
  return db.businessProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })
}

export async function updateBusinessLogo(userId: string, logoUrl: string) {
  return db.businessProfile.upsert({
    where: { userId },
    create: { userId, logoUrl },
    update: { logoUrl },
  })
}

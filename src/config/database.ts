import { PrismaClient } from '@prisma/client'
import { env } from './env'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

export async function connectDatabase(): Promise<void> {
  await db.$connect()
}

export async function disconnectDatabase(): Promise<void> {
  await db.$disconnect()
}

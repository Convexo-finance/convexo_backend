import '@fastify/jwt'
import 'fastify'
import { AccountType, AdminRoleType, OnboardingStep } from '@prisma/client'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

export interface JwtPayload {
  sub: string           // userId (cuid)
  address: string       // walletAddress (0x...)
  accountType: AccountType | null
  onboardingStep: OnboardingStep
  isAdmin: boolean
  adminRole: AdminRoleType | null
  iat?: number
  exp?: number
  [key: string]: unknown
}

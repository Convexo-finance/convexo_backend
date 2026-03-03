import { randomBytes } from 'crypto'
import { verifyMessage } from 'viem'
import { SiweMessage } from 'siwe'
import type { FastifyInstance } from 'fastify'
import { db } from '../../config/database'
import { redis, RedisKeys, RedisTTL } from '../../config/redis'
import { env } from '../../config/env'
import { UnauthorizedError, BadRequestError } from '../../shared/errors'
import type { AuthMethod } from '@prisma/client'
import type { JwtPayload } from '../../types'

// ─── Nonce ────────────────────────────────────────────────────────────────────

export async function generateNonce(address: string): Promise<string> {
  const nonce = randomBytes(16).toString('hex')
  const key = RedisKeys.siweNonce(address)
  await redis.setex(key, RedisTTL.SIWE_NONCE, nonce)
  return nonce
}

// ─── Verify SIWE ──────────────────────────────────────────────────────────────

export async function verifySiweSignature(
  message: string,
  signature: string,
  address: string,
): Promise<void> {
  // Verify the cryptographic signature with viem
  const isValid = await verifyMessage({
    address: address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  })

  if (!isValid) {
    throw new UnauthorizedError('Invalid signature')
  }

  // Parse the SIWE message to validate nonce
  try {
    const siweMessage = new SiweMessage(message)

    // Verify nonce matches what we generated
    const storedNonce = await redis.get(RedisKeys.siweNonce(address.toLowerCase()))
    if (!storedNonce || storedNonce !== siweMessage.nonce) {
      throw new UnauthorizedError('Invalid or expired nonce')
    }

    // Consume the nonce (one-time use)
    await redis.del(RedisKeys.siweNonce(address.toLowerCase()))
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new BadRequestError('Invalid SIWE message format')
  }
}

// ─── User upsert ──────────────────────────────────────────────────────────────

export async function upsertUser(
  address: string,
  authMethod: AuthMethod,
  chainId: number,
  smartAccount?: string,
) {
  const normalizedAddress = address.toLowerCase()

  const user = await db.user.upsert({
    where: { walletAddress: normalizedAddress },
    create: {
      walletAddress: normalizedAddress,
      authMethod,
      chainId,
      smartAccount: smartAccount?.toLowerCase() ?? null,
    },
    update: {
      authMethod,
      chainId,
      ...(smartAccount && { smartAccount: smartAccount.toLowerCase() }),
    },
    include: {
      adminRole: true,
    },
  })

  // Bootstrap admin role from env on first login
  const adminAddresses = (env.ADMIN_WALLET_ADDRESSES ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)

  if (adminAddresses.includes(normalizedAddress) && !user.adminRole) {
    await db.adminRole.create({
      data: {
        userId: user.id,
        role: 'SUPER_ADMIN',
        grantedBy: 'system',
      },
    })
  }

  return db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { adminRole: true },
  })
}

// ─── JWT issue ────────────────────────────────────────────────────────────────

export function issueTokens(
  app: FastifyInstance,
  user: Awaited<ReturnType<typeof upsertUser>>,
): { accessToken: string; refreshToken: string } {
  const payload = {
    sub: user.id,
    address: user.walletAddress,
    accountType: user.accountType,
    onboardingStep: user.onboardingStep,
    isAdmin: !!user.adminRole,
    adminRole: user.adminRole?.role ?? null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessToken = (app.jwt as any).sign(payload, { expiresIn: env.JWT_EXPIRES_IN })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = (app.jwt as any).sign(
    { ...payload, tokenType: 'refresh' },
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
  )

  return { accessToken, refreshToken }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function blacklistToken(userId: string): Promise<void> {
  // Blacklist by userId so all tokens for this user are invalidated
  await redis.setex(
    RedisKeys.jwtBlacklist(userId),
    RedisTTL.JWT_BLACKLIST,
    '1',
  )
}

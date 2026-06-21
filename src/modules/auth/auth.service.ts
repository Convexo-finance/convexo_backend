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

function allowedSiweDomains(): string[] {
  return (env.SIWE_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Verifies a SIWE login. Beyond the cryptographic signature, this validates the
 * message's own claimed fields — address, domain (allowlist), expiration/notBefore
 * — and consumes the single-use nonce. Returns the chainId from the *signed*
 * message (not a client-supplied body field) so the caller can't be lied to.
 *
 * Hardened 2026-06-19 (auth audit): previously only the signature + nonce were
 * checked, so a signature gathered on any origin/chain passed.
 */
export async function verifySiweSignature(
  message: string,
  signature: string,
  address: string,
): Promise<{ chainId: number }> {
  let siweMessage: SiweMessage
  try {
    siweMessage = new SiweMessage(message)
  } catch {
    throw new BadRequestError('Invalid SIWE message format')
  }

  // 1. The message must be for the address being authenticated
  if (siweMessage.address.toLowerCase() !== address.toLowerCase()) {
    throw new UnauthorizedError('SIWE address mismatch')
  }

  // 2. Domain allowlist (anti-phishing). Skipped only when unconfigured (dev).
  const allowed = allowedSiweDomains()
  if (allowed.length > 0 && !allowed.includes(siweMessage.domain.toLowerCase())) {
    throw new UnauthorizedError('SIWE domain not allowed')
  }

  // 3. Time bounds, when present on the message
  const now = Date.now()
  if (siweMessage.expirationTime && Date.parse(siweMessage.expirationTime) < now) {
    throw new UnauthorizedError('SIWE message has expired')
  }
  if (siweMessage.notBefore && Date.parse(siweMessage.notBefore) > now) {
    throw new UnauthorizedError('SIWE message is not yet valid')
  }

  // 4. Cryptographic signature
  const isValid = await verifyMessage({
    address: address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  })
  if (!isValid) {
    throw new UnauthorizedError('Invalid signature')
  }

  // 5. Single-use nonce
  const storedNonce = await redis.get(RedisKeys.siweNonce(address.toLowerCase()))
  if (!storedNonce || storedNonce !== siweMessage.nonce) {
    throw new UnauthorizedError('Invalid or expired nonce')
  }
  await redis.del(RedisKeys.siweNonce(address.toLowerCase()))

  return { chainId: siweMessage.chainId }
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

  // Each token gets its own jti so logout can revoke *that* token without
  // bricking the user's future logins (auth audit fix, 2026-06-19).
  const accessJti  = randomBytes(16).toString('hex')
  const refreshJti = randomBytes(16).toString('hex')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessToken = (app.jwt as any).sign(
    { ...payload, jti: accessJti },
    { expiresIn: env.JWT_EXPIRES_IN },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = (app.jwt as any).sign(
    { ...payload, jti: refreshJti, tokenType: 'refresh' },
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
  )

  return { accessToken, refreshToken }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

/**
 * Revokes a single token by its `jti`. TTL defaults to the token's remaining
 * lifetime so the key self-expires. Previously this blacklisted by userId for
 * 30 days, which then rejected the user's *next* login too — fixed 2026-06-19.
 */
export async function blacklistToken(jti: string, ttlSeconds?: number): Promise<void> {
  const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : RedisTTL.JWT_BLACKLIST
  await redis.setex(RedisKeys.jwtBlacklist(jti), ttl, '1')
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

export function verifyRefreshToken(
  app: FastifyInstance,
  refreshToken: string,
): JwtPayload & { tokenType: string; chainId?: number } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = (app.jwt as any).verify(refreshToken) as JwtPayload & { tokenType?: string; chainId?: number }

    // Ensure it's actually a refresh token, not an access token
    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedError('Invalid token type — expected refresh token')
    }

    return payload as JwtPayload & { tokenType: string; chainId?: number }
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid or expired refresh token')
  }
}

// ─── Find user by ID (for refresh) ───────────────────────────────────────────

export async function findUserById(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { adminRole: true },
  })
  if (!user) throw new UnauthorizedError('User not found')
  return user
}

// ─── Refresh Rate Limiting ────────────────────────────────────────────────────

export async function checkRefreshRateLimit(userId: string): Promise<void> {
  const key = `rate:refresh:${userId}`
  const current = await redis.incr(key)

  // Set TTL on first increment (60 seconds window)
  if (current === 1) {
    await redis.expire(key, 60)
  }

  // Max 5 refresh calls per minute per user
  if (current > 5) {
    throw new BadRequestError('Too many refresh attempts. Please wait a moment.')
  }
}

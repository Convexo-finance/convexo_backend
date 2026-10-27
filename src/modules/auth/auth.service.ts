import { randomBytes } from 'crypto'
import { verifyMessage } from 'viem'
import { SiweMessage } from 'siwe'
import type { FastifyInstance } from 'fastify'
import { db } from '../../config/database'
import { redis, RedisKeys, RedisTTL } from '../../config/redis'
import { env } from '../../config/env'
import { UnauthorizedError, BadRequestError, AppError } from '../../shared/errors'
import { logger } from '../../shared/logger'
import { getPublicClient } from '../../shared/viem'
import { SUPPORTED_CHAINS, type SupportedChainId } from '../../config/chains'
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

/**
 * SIWE_ALLOWED_DOMAINS entries are exact hosts (`protocol.convexo.xyz`,
 * `localhost:3000`) or a leading-wildcard subdomain pattern
 * (`*.convexo.xyz` — matches `a.convexo.xyz`, not `convexo.xyz` itself).
 */
function allowedSiweDomains(): string[] {
  return (env.SIWE_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

export function isSiweDomainAllowed(domain: string, allowed = allowedSiweDomains()): boolean {
  const host = domain.toLowerCase()
  return allowed.some((entry) =>
    entry.startsWith('*.')
      ? host.endsWith(entry.slice(1)) && host.length > entry.length - 1
      : host === entry,
  )
}

let warnedNoAllowlist = false

function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return chainId in SUPPORTED_CHAINS
}

/**
 * Signature check that works for every signer we support:
 *  1. Offline ECDSA (EIP-191 personal_sign) — Privy embedded wallets and plain
 *     EOAs (MetaMask etc.). No RPC, no network, so it works on a cold start.
 *     Also correct for EIP-7702-delegated EOAs: the EOA key still signs.
 *  2. Only if (1) fails: on-chain EIP-1271 / ERC-6492 on the chain named in the
 *     *signed* message — smart-contract wallets (Coinbase Smart Wallet, Safe)
 *     that an admin might connect through RainbowKit. ERC-6492 also covers
 *     counterfactual (not-yet-deployed) accounts.
 */
async function verifySignature(
  address: `0x${string}`,
  message: string,
  signature: `0x${string}`,
  chainId: number,
): Promise<boolean> {
  try {
    if (await verifyMessage({ address, message, signature })) return true
  } catch {
    // Malformed / non-ECDSA signature (e.g. a 6492-wrapped one) — try on-chain.
  }

  if (!isSupportedChainId(chainId)) return false
  try {
    return await getPublicClient(chainId).verifyMessage({ address, message, signature })
  } catch (err) {
    logger.warn({ err, chainId }, 'SIWE on-chain signature verification failed')
    return false
  }
}

/**
 * Verifies a SIWE login. Beyond the cryptographic signature, this validates the
 * message's own claimed fields — address, domain (allowlist), uri host,
 * expiration/notBefore — and consumes the single-use nonce. Returns the chainId
 * from the *signed* message (not a client-supplied body field).
 *
 * Serverless-safe: every piece of state (the nonce) lives in Redis; nothing is
 * kept in process memory between `/auth/nonce` and `/auth/verify`, which may run
 * on different function instances.
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
  if (allowed.length > 0) {
    if (!isSiweDomainAllowed(siweMessage.domain, allowed)) {
      throw new UnauthorizedError(`SIWE domain not allowed: ${siweMessage.domain}`)
    }
  } else if (env.NODE_ENV === 'production' && !warnedNoAllowlist) {
    warnedNoAllowlist = true
    logger.warn('SIWE_ALLOWED_DOMAINS is empty in production — SIWE domain check disabled')
  }

  // 2b. The uri must be on the same host the user saw in the wallet prompt.
  let uriHost: string
  try {
    uriHost = new URL(siweMessage.uri).host.toLowerCase()
  } catch {
    throw new BadRequestError('Invalid SIWE uri')
  }
  if (uriHost !== siweMessage.domain.toLowerCase()) {
    throw new UnauthorizedError('SIWE uri does not match domain')
  }

  // 3. Time bounds, when present on the message
  const now = Date.now()
  if (siweMessage.expirationTime && Date.parse(siweMessage.expirationTime) < now) {
    throw new UnauthorizedError('SIWE message has expired')
  }
  if (siweMessage.notBefore && Date.parse(siweMessage.notBefore) > now) {
    throw new UnauthorizedError('SIWE message is not yet valid')
  }

  // 4. Nonce must be the one we issued (cheap Redis read before any RPC work)
  const nonceKey = RedisKeys.siweNonce(address)
  const storedNonce = await redis.get(nonceKey)
  if (!storedNonce || storedNonce !== siweMessage.nonce) {
    throw new UnauthorizedError('Invalid or expired nonce')
  }

  // 5. Cryptographic signature (ECDSA, then EIP-1271/6492 fallback)
  const isValid = await verifySignature(
    address as `0x${string}`,
    message,
    signature as `0x${string}`,
    siweMessage.chainId,
  )
  if (!isValid) {
    throw new UnauthorizedError('Invalid signature')
  }

  // 6. Consume the nonce. DEL returns 1 for exactly one caller, so two
  //    concurrent verifies with the same signed message can't both succeed.
  const consumed = await redis.del(nonceKey)
  if (consumed !== 1) {
    throw new UnauthorizedError('Invalid or expired nonce')
  }

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

// ─── Revocation ───────────────────────────────────────────────────────────────

/**
 * Revokes a single token by its `jti`. TTL defaults to the token's remaining
 * lifetime so the key self-expires. Previously this blacklisted by userId for
 * 30 days, which then rejected the user's *next* login too — fixed 2026-06-19.
 */
export async function blacklistToken(jti: string, ttlSeconds?: number): Promise<void> {
  const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : RedisTTL.JWT_BLACKLIST
  await redis.setex(RedisKeys.jwtBlacklist(jti), ttl, '1')
}

export async function isTokenRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false
  return (await redis.get(RedisKeys.jwtBlacklist(jti))) !== null
}

/** Blacklists a decoded token for whatever lifetime it has left. */
export async function revokeDecodedToken(payload: { jti?: string; exp?: number }): Promise<void> {
  if (!payload.jti) return
  const ttl = payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : undefined
  if (ttl !== undefined && ttl <= 0) return // already expired — nothing to revoke
  await blacklistToken(payload.jti, ttl)
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

type RefreshPayload = JwtPayload & { tokenType: string; chainId?: number }

/**
 * Verifies a refresh token: signature + expiry, `tokenType: 'refresh'`, and not
 * revoked (logout, or already rotated by a previous /auth/refresh).
 */
export async function verifyRefreshToken(
  app: FastifyInstance,
  refreshToken: string,
): Promise<RefreshPayload> {
  let payload: JwtPayload & { tokenType?: string; chainId?: number }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload = (app.jwt as any).verify(refreshToken) as JwtPayload & { tokenType?: string; chainId?: number }
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  if (payload.tokenType !== 'refresh') {
    throw new UnauthorizedError('Invalid token type — expected refresh token')
  }
  if (await isTokenRevoked(payload.jti)) {
    throw new UnauthorizedError('Refresh token has been revoked')
  }

  return payload as RefreshPayload
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
  // 429, not 400: clients must treat this as "retry later", not "session dead".
  if (current > 5) {
    throw new AppError(429, 'Too many refresh attempts. Please wait a moment.', 'RATE_LIMITED')
  }
}

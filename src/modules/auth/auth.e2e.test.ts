/**
 * Auth end-to-end (in-process) — GET /auth/nonce → POST /auth/verify → refresh →
 * logout, through the real Fastify app (`buildApp`) with `app.inject`, signing a
 * real EIP-4361 message with a locally generated viem account.
 *
 * External services are replaced in-process (no network, no containers):
 *  - Redis: the ioredis singleton's methods are swapped for an in-memory Map
 *    (get/setex/del/incr/expire + the @fastify/rate-limit `rateLimit` command).
 *  - Prisma: `db.user` / `db.adminRole` methods are swapped for in-memory fakes.
 *    (The repo has no test Postgres yet — see .claude/rules/testing-practices.md.)
 *  - RPC: ETHEREUM_SEPOLIA_RPC_URL points at a closed local port, so the
 *    EIP-1271/6492 fallback fails fast instead of reaching the network.
 *
 * Run: npm test
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createSiweMessage } from 'viem/siwe'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test'
process.env.REDIS_URL = 'redis://127.0.0.1:1'
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234'
process.env.SIWE_ALLOWED_DOMAINS = 'protocol.convexo.xyz, localhost:3000, *.preview.convexo.xyz'
process.env.ETHEREUM_SEPOLIA_RPC_URL = 'http://127.0.0.1:1'

type App = Awaited<ReturnType<typeof import('../../app').buildApp>>
let app: App
let isSiweDomainAllowed: typeof import('./auth.service').isSiweDomainAllowed

// ─── In-memory fakes ──────────────────────────────────────────────────────────

const kv = new Map<string, string>()
interface FakeUser {
  id: string
  walletAddress: string
  authMethod: string
  chainId: number
  smartAccount: string | null
  accountType: null
  onboardingStep: 'NOT_STARTED'
  adminRole: null | { role: string }
}
const users = new Map<string, FakeUser>()

before(async () => {
  const { redis } = await import('../../config/redis')
  const { db } = await import('../../config/database')
  const r = redis as unknown as Record<string, unknown>
  r.get = async (k: string) => kv.get(k) ?? null
  r.setex = async (k: string, _ttl: number, v: string) => { kv.set(k, v); return 'OK' }
  r.del = async (k: string) => (kv.delete(k) ? 1 : 0)
  r.incr = async (k: string) => { const n = Number(kv.get(k) ?? 0) + 1; kv.set(k, String(n)); return n }
  r.expire = async () => 1
  r.rateLimit = (_k: string, tw: number, _max: number, _c: boolean, _e: boolean, cb: (e: null, r: [number, number]) => void) => cb(null, [1, tw])

  const d = db as unknown as { user: Record<string, unknown>; adminRole: Record<string, unknown> }
  d.user.upsert = async ({ where, create, update }: { where: { walletAddress: string }; create: FakeUser; update: Partial<FakeUser> }) => {
    const existing = [...users.values()].find((u) => u.walletAddress === where.walletAddress)
    if (existing) { Object.assign(existing, update); return existing }
    const u: FakeUser = { ...create, id: `user_${users.size + 1}`, accountType: null, onboardingStep: 'NOT_STARTED', adminRole: null }
    users.set(u.id, u)
    return u
  }
  d.user.findUniqueOrThrow = async ({ where }: { where: { id: string } }) => {
    const u = users.get(where.id); if (!u) throw new Error('not found'); return u
  }
  d.user.findUnique = async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null
  d.adminRole.create = async () => ({})

  const { buildApp } = await import('../../app')
  ;({ isSiweDomainAllowed } = await import('./auth.service'))
  app = await buildApp()
  await app.ready()
})

after(async () => { await app?.close() })

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getNonce(address: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/auth/nonce?address=${address}` })
  assert.equal(res.statusCode, 200, res.body)
  return res.json().nonce
}

function buildMessage(address: `0x${string}`, nonce: string, overrides: Partial<Parameters<typeof createSiweMessage>[0]> = {}) {
  return createSiweMessage({
    domain: 'protocol.convexo.xyz',
    address,
    statement: 'Sign in to Convexo',
    uri: 'https://protocol.convexo.xyz',
    version: '1',
    chainId: 11155111,
    nonce,
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 5 * 60_000),
    ...overrides,
  })
}

async function verify(body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/auth/verify', payload: body })
}

async function login() {
  const account = privateKeyToAccount(generatePrivateKey())
  const nonce = await getNonce(account.address)
  const message = buildMessage(account.address, nonce)
  const signature = await account.signMessage({ message })
  const res = await verify({ message, signature, address: account.address, chainId: 11155111, authMethod: 'EMAIL' })
  assert.equal(res.statusCode, 200, res.body)
  return { account, ...res.json() as { accessToken: string; refreshToken: string; user: { id: string; walletAddress: string } } }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('happy path: nonce → SIWE verify → tokens → protected route', async () => {
  const { account, accessToken, refreshToken, user } = await login()
  assert.ok(accessToken && refreshToken)
  assert.equal(user.walletAddress, account.address.toLowerCase())
  assert.equal(users.get(user.id)?.authMethod, 'EMAIL')

  const me = await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${accessToken}` } })
  assert.equal(me.statusCode, 200, me.body)
})

test('nonce lookup is case-insensitive (lowercase query, checksummed message)', async () => {
  const account = privateKeyToAccount(generatePrivateKey())
  const nonce = await getNonce(account.address.toLowerCase())
  const message = buildMessage(account.address, nonce)
  const signature = await account.signMessage({ message })
  const res = await verify({ message, signature, address: account.address })
  assert.equal(res.statusCode, 200, res.body)
})

test('nonce is single-use: replaying the same signed message fails', async () => {
  const account = privateKeyToAccount(generatePrivateKey())
  const nonce = await getNonce(account.address)
  const message = buildMessage(account.address, nonce)
  const signature = await account.signMessage({ message })
  assert.equal((await verify({ message, signature, address: account.address })).statusCode, 200)
  const replay = await verify({ message, signature, address: account.address })
  assert.equal(replay.statusCode, 401)
  assert.match(replay.json().message, /nonce/i)
})

test('rejects a domain outside SIWE_ALLOWED_DOMAINS', async () => {
  const account = privateKeyToAccount(generatePrivateKey())
  const nonce = await getNonce(account.address)
  const message = buildMessage(account.address, nonce, { domain: 'evil.example', uri: 'https://evil.example' })
  const signature = await account.signMessage({ message })
  const res = await verify({ message, signature, address: account.address })
  assert.equal(res.statusCode, 401)
  assert.match(res.json().message, /domain not allowed: evil\.example/)
})

test('rejects a uri whose host differs from the domain', async () => {
  const account = privateKeyToAccount(generatePrivateKey())
  const nonce = await getNonce(account.address)
  const message = buildMessage(account.address, nonce, { uri: 'https://evil.example' })
  const signature = await account.signMessage({ message })
  const res = await verify({ message, signature, address: account.address })
  assert.equal(res.statusCode, 401)
})

test('rejects a signature from a different key (and the nonce survives)', async () => {
  const account = privateKeyToAccount(generatePrivateKey())
  const attacker = privateKeyToAccount(generatePrivateKey())
  const nonce = await getNonce(account.address)
  const message = buildMessage(account.address, nonce)
  const badSig = await attacker.signMessage({ message })
  const res = await verify({ message, signature: badSig, address: account.address })
  assert.equal(res.statusCode, 401)
  assert.match(res.json().message, /signature/i)
  // A failed attempt must not burn the user's nonce.
  const goodSig = await account.signMessage({ message })
  assert.equal((await verify({ message, signature: goodSig, address: account.address })).statusCode, 200)
})

test('rejects an expired SIWE message', async () => {
  const account = privateKeyToAccount(generatePrivateKey())
  const nonce = await getNonce(account.address)
  const message = buildMessage(account.address, nonce, { expirationTime: new Date(Date.now() - 1000) })
  const signature = await account.signMessage({ message })
  assert.equal((await verify({ message, signature, address: account.address })).statusCode, 401)
})

test('refresh rotates tokens; the old refresh token cannot be replayed', async () => {
  const { refreshToken } = await login()
  const r1 = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } })
  assert.equal(r1.statusCode, 200, r1.body)
  const rotated = r1.json() as { accessToken: string; refreshToken: string }
  assert.notEqual(rotated.refreshToken, refreshToken)

  const replay = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } })
  assert.equal(replay.statusCode, 401)

  const r2 = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: rotated.refreshToken } })
  assert.equal(r2.statusCode, 200, r2.body)
})

test('a refresh token is not accepted as an access token', async () => {
  const { refreshToken } = await login()
  const res = await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${refreshToken}` } })
  assert.equal(res.statusCode, 401)
})

test('logout revokes the access token and the refresh token; re-login works', async () => {
  const { account, accessToken, refreshToken } = await login()
  const out = await app.inject({
    method: 'POST', url: '/auth/logout',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { refreshToken },
  })
  assert.equal(out.statusCode, 200, out.body)

  const again = await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${accessToken}` } })
  assert.equal(again.statusCode, 401)
  const refresh = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } })
  assert.equal(refresh.statusCode, 401)

  // Same wallet signs in again → fresh, working session (no per-user lockout).
  const nonce = await getNonce(account.address)
  const message = buildMessage(account.address, nonce)
  const res = await verify({ message, signature: await account.signMessage({ message }), address: account.address })
  assert.equal(res.statusCode, 200, res.body)
  const ok = await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${res.json().accessToken}` } })
  assert.equal(ok.statusCode, 200)
})

test('logout with Content-Type: application/json and an empty body is accepted', async () => {
  const { accessToken } = await login()
  const res = await app.inject({
    method: 'POST', url: '/auth/logout',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
  })
  assert.equal(res.statusCode, 200, res.body)
})

test('CORS preflight allows PATCH from the frontend origin', async () => {
  const res = await app.inject({
    method: 'OPTIONS', url: '/admin/kyb/submissions/x/status',
    headers: { origin: 'https://admin.convexo.xyz', 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'authorization,content-type' },
  })
  assert.ok(res.statusCode === 204 || res.statusCode === 200, String(res.statusCode))
  assert.match(String(res.headers['access-control-allow-methods']), /PATCH/)
  assert.equal(res.headers['access-control-allow-origin'], 'https://admin.convexo.xyz')
})

test('isSiweDomainAllowed: exact hosts and leading-wildcard subdomains', () => {
  const allowed = ['protocol.convexo.xyz', 'localhost:3000', '*.preview.convexo.xyz']
  assert.equal(isSiweDomainAllowed('protocol.convexo.xyz', allowed), true)
  assert.equal(isSiweDomainAllowed('PROTOCOL.convexo.xyz', allowed), true)
  assert.equal(isSiweDomainAllowed('localhost:3000', allowed), true)
  assert.equal(isSiweDomainAllowed('localhost:3001', allowed), false)
  assert.equal(isSiweDomainAllowed('pr-12.preview.convexo.xyz', allowed), true)
  assert.equal(isSiweDomainAllowed('preview.convexo.xyz', allowed), false)
  assert.equal(isSiweDomainAllowed('evilpreview.convexo.xyz', allowed), false)
  assert.equal(isSiweDomainAllowed('protocol.convexo.xyz.evil.io', allowed), false)
})

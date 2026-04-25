# Convexo Backend — Claude Code Workspace

## What this project is

Convexo Backend is a production REST API powering the Convexo Protocol — a DeFi platform that bridges traditional finance and blockchain. It handles wallet-based authentication (SIWE/EIP-4361), a 10-step onboarding state machine, manual and automated KYC/KYB verification, AI-powered credit scoring via n8n, encrypted bank account management, OTC trade orders, tokenized bond vaults, USDC/ECOP pool monitoring with an on-chain keeper, and a full admin panel. Built on Fastify 5 + TypeScript + Prisma + PostgreSQL + Redis, deployed on Railway with automated migrations.

---

## Folder structure

```
convexo-backend/
├── src/
│   ├── index.ts                  # Entry point: DB/Redis connect, start server, pool keeper
│   ├── app.ts                    # Fastify factory: registers plugins + all 15 module routes
│   ├── types.ts                  # Global types: JwtPayload, FastifyRequest augmentation
│   │
│   ├── config/
│   │   ├── env.ts                # Zod-validated env schema — fails fast on startup
│   │   ├── database.ts           # Prisma singleton (connect/disconnect)
│   │   ├── redis.ts              # ioredis singleton + key helpers + TTL constants
│   │   ├── chains.ts             # Supported chains (Base, Unichain, Arbitrum, Ethereum + testnets)
│   │   └── contracts.ts          # NFT contract addresses by chain + ABIs
│   │
│   ├── plugins/                  # Fastify plugins (load order matters — see app.ts)
│   │   ├── swagger.ts            # OpenAPI /docs — open in dev, DOCS_SECRET token-gated in prod
│   │   ├── cors.ts               # Reflect any origin, JWT controls access
│   │   ├── rateLimit.ts          # 100 req/min global (Redis-backed)
│   │   ├── multipart.ts          # 20 MB file upload limit, 10 files max
│   │   └── auth.ts               # @fastify/jwt registration
│   │
│   ├── middleware/               # Composable preHandler functions
│   │   ├── requireAuth.ts        # JWT verify + Redis blacklist check
│   │   ├── requireAdmin.ts       # VIEWER < VERIFIER < SUPER_ADMIN hierarchy
│   │   ├── requireAccountType.ts # requireIndividual | requireBusiness
│   │   ├── requireOnboarded.ts   # Onboarding completion check
│   │   └── requireTier.ts        # NFT tier gating
│   │
│   ├── modules/                  # 15 feature domains (each: routes/controller/service/schema)
│   │   ├── auth/                 # SIWE sign-in, nonce, token refresh, logout
│   │   ├── users/                # /users/me CRUD + GDPR delete
│   │   ├── onboarding/           # 10-step state machine
│   │   ├── profile/              # Individual/Business profile management
│   │   ├── verification/         # KYC (Veriff), KYB (Sumsub), manual submissions, credit score
│   │   ├── bank-accounts/        # AES-256-GCM encrypted bank account CRUD
│   │   ├── contacts/             # Wallet address book
│   │   ├── rates/                # Exchange rate cache (admin-managed)
│   │   ├── otc/                  # OTC trade orders (buy/sell crypto↔fiat)
│   │   ├── documents/            # Pinata IPFS document upload + tracking
│   │   ├── reputation/           # NFT tier sync from chain + Redis cache
│   │   ├── funding/              # Vault funding requests (Business Tier 3)
│   │   ├── vault/                # TokenizedBondVault registration
│   │   ├── pool/                 # USDC/ECOP pool monitoring + keeper
│   │   ├── admin/                # Admin panel (users, verifications, KYB/KYC, credit score)
│   │   └── notifications/        # Email (Resend) + Telegram service
│   │
│   ├── webhooks/                 # HMAC/Bearer-verified external callbacks
│   │   ├── veriff.webhook.ts     # KYC result (x-hmac-signature)
│   │   ├── sumsub.webhook.ts     # KYB result (x-payload-digest)
│   │   └── n8n.webhook.ts        # Credit score result (Bearer token)
│   │
│   └── shared/
│       ├── errors.ts             # AppError hierarchy: NotFound/Unauthorized/Forbidden/etc.
│       ├── logger.ts             # Pino singleton (JSON in prod, pretty in dev)
│       ├── pagination.ts         # Shared pagination helpers
│       └── viem.ts               # Blockchain interaction utilities
│
├── prisma/
│   ├── schema.prisma             # 17 models, 21 enums
│   └── migrations/               # Timestamped SQL migration files
│
├── Dockerfile                    # Multi-stage: builder (tsc) + production (dist/ only)
├── docker-compose.yml            # Local: postgres:16 + redis:7 + api
├── railway.toml                  # preDeployCommand: prisma migrate deploy
├── .env.example                  # All required + optional env vars documented
└── package.json                  # v1.0.0 — scripts: dev, build, start, db:*
```

---

## Stack and why

| Tool | Version | Why |
|------|---------|-----|
| **Fastify 5** | 5.1.0 | Fastest Node HTTP framework, native TypeScript, plugin system |
| **TypeScript** | 5.6.3 | Type safety, IDE support, compile-time error catching |
| **Prisma** | 5.22.0 | Type-safe ORM, auto-generated migrations, schema-first |
| **PostgreSQL 16** | via Railway | Relational DB for all user/verification/order data |
| **Redis 7 (ioredis)** | 5.4.1 | SIWE nonces, JWT blacklist, rate limiting, pool/reputation cache |
| **Zod** | 3.23.8 | Runtime validation for env vars and request bodies |
| **viem** | 2.21.54 | Type-safe Ethereum RPC calls (NFT balance reads, contract writes) |
| **SIWE** | 2.3.2 | EIP-4361 wallet authentication (no passwords) |
| **Resend** | 4.0.0 | Transactional email (verification results, OTC notifications) |
| **Pinata SDK** | 2.1.0 | IPFS pinning for public documents (credit score financials, general docs) |
| **Pino** | 9.5.0 | High-performance structured logging |

---

## What Claude is allowed to do

- Read and edit any file in this repository
- Run `npm run build`, `npm run dev`, `npx tsc --noEmit`, `npx prisma validate`, `npx prisma generate`
- Run `git status`, `git diff`, `git log`, `git add`, `git commit`, `git push`
- Run `railway deployment list`, `railway logs`, `railway service link`, `railway up --detach`
- Run `railway variable list` (read-only)
- Create new files following the module pattern (routes/controller/service/schema)
- Write new Prisma migrations

## What Claude must NOT do

- Never run `prisma migrate reset` or `prisma migrate dev --force` on production data
- Never commit `.env` or any file containing real secrets
- Never skip TypeScript type checking before deploying
- Never use `git push --force` without explicit confirmation
- Never drop database columns without a migration that handles existing data
- Never deploy without running `npx tsc --noEmit` first
- Never store sensitive documents (KYB/KYC files) on Pinata — use `SubmissionDocument` (PostgreSQL bytea) instead
- Never add raw SQL to source code — only in migration files
- Never skip the `requireAuth` middleware on routes that return user data

---

## Module pattern — always follow this

Every new feature gets a folder under `src/modules/[name]/` with exactly these files:

```
[name].routes.ts    # FastifyInstance function, registers routes with preHandlers
[name].schema.ts    # Zod schemas + exported TypeScript types
[name].controller.ts # Thin: parse input → call service → reply
[name].service.ts   # Business logic, Prisma queries, external API calls
```

Register the routes function in `src/app.ts` via `await app.register(yourRoutes)`.

---

## Database rules

- Every schema change needs a migration in `prisma/migrations/YYYYMMDDHHMMSS_description/migration.sql`
- Making a nullable column required → always backfill NULLs before setting NOT NULL
- After editing `schema.prisma` → always run `npx prisma validate` then `npx prisma generate`
- Migration naming: `YYYYMMDDHHMMSS_short_snake_case_description`
- Never alter enums by removing values — only add new values with `ALTER TYPE ... ADD VALUE`
- Bytes fields (binary) → map to `BYTEA` in SQL, returns `Buffer` in TypeScript

---

## Authentication flow

```
Client → GET /auth/nonce?address=0x...
       ← { nonce: "abc123" }

Client signs SIWE message with wallet

Client → POST /auth/verify { message, signature }
       ← { accessToken, refreshToken, user }

Client → Authorization: Bearer {accessToken} on all protected requests

Client → POST /auth/refresh { refreshToken }
       ← { accessToken }

Client → POST /auth/logout
       ← 204 (token blacklisted in Redis for 30 days)
```

---

## Error handling pattern

Throw from services, caught by global handler in `app.ts`:

```typescript
import { NotFoundError, ForbiddenError, BadRequestError } from '../../shared/errors'

throw new NotFoundError('BankAccount')   // 404
throw new ForbiddenError()               // 403
throw new BadRequestError('reason')      // 400
```

Never return error shapes manually from controllers.

---

## Middleware composition

```typescript
app.post('/endpoint', {
  preHandler: [requireAuth],                              // auth only
  preHandler: [requireAuth, requireIndividual],           // individual only
  preHandler: [requireAuth, requireBusiness],             // business only
  preHandler: [requireAuth, requireAdmin('VIEWER')],      // admin VIEWER+
  preHandler: [requireAuth, requireAdmin('VERIFIER')],    // admin VERIFIER+
  preHandler: [requireAuth, requireAdmin('SUPER_ADMIN')], // super admin only
  handler: myController,
})
```

---

## Notifications pattern

Always fire non-blocking (never await at top level, catch errors):

```typescript
sendEmail({ userId, to, subject, html })
  .catch(err => logger.error({ err }, 'email failed'))

sendTelegram({ userId, chatId: env.TELEGRAM_ADMIN_CHAT_ID, text })
  .catch(err => logger.error({ err }, 'telegram failed'))
```

---

## Skill trigger table

| Condition | Skill to activate |
|-----------|------------------|
| Any TypeScript error or failed `tsc --noEmit` | `fix-error` |
| Adding a new API endpoint or domain | `add-module` |
| Changing `schema.prisma` | `db-migration` |
| Deploying to Railway | `deploy` |
| A webhook starts failing or needs to be added | `add-webhook` |
| A security concern is raised | `security-review` |
| Code review requested | `code-review` |

---

## CHANGELOG rule

After every meaningful change (new feature, bug fix, schema change, deployment), Claude appends an entry to `CHANGELOG.md` in this format:

```markdown
## [v3.XX] — YYYY-MM-DD
### Added / Fixed / Changed / Removed
- One-line description of what changed and why
```

---

## Key environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | JWT signing secret (32+ chars) |
| `APP_URL` | Yes | Public URL of this API (used in Swagger server config) |
| `DOCS_SECRET` | Prod | Token to access `/docs` in production (16+ chars) |
| `NODE_ENV` | Yes | `production` on Railway, `development` locally |
| `ENCRYPTION_KEY` | Yes | AES-256 key for bank account encryption (64 hex chars) |
| `TELEGRAM_ADMIN_CHAT_ID` | Opt | Admin alert chat for KYB/KYC submissions |
| `NETWORK_MODE` | Yes | `mainnet` or `testnet` — controls which chain is primary |

See `.env.example` for the full list.

---

## Key Redis key patterns

| Key | TTL | Purpose |
|-----|-----|---------|
| `siwe:nonce:{address}` | 5 min | One-time SIWE nonce |
| `jwt:blacklist:{userId}` | 30 days | Revoked tokens (logout) |
| `rate:{pair}` | 10 min | Exchange rate cache |
| `reputation:{userId}` | 30 min | NFT tier cache |
| `pool:status:{chainId}` | 60 s | Pool price + rebalance status |

---

## All API endpoints (reference)

### Public
- `GET /health`
- `GET /auth/nonce`
- `GET /rates`, `GET /rates/:pair`
- `GET /pool/status`, `GET /pool/status/:chainId`
- `GET /docs?token=<DOCS_SECRET>` — Swagger UI (token required in production)

### Authenticated (requireAuth)
- `POST /auth/verify`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /users/me`, `PUT /users/me`, `DELETE /users/me`
- `GET /onboarding/status`, `POST /onboarding/type`, `POST /onboarding/profile`, `POST /onboarding/complete`
- `GET /profile`, `PUT /profile`
- `GET /verification/status`
- `GET /bank-accounts`, `POST /bank-accounts`, `PUT /bank-accounts/:id`, `DELETE /bank-accounts/:id`, `POST /bank-accounts/:id/default`
- `GET /contacts`, `GET /contacts/:id`, `POST /contacts`, `PUT /contacts/:id`, `DELETE /contacts/:id`
- `GET /documents`, `GET /documents/:id`, `POST /documents`, `DELETE /documents/:id`
- `GET /reputation`, `POST /reputation/sync`

### Individual only (requireAuth + requireIndividual)
- `POST /verification/kyc/start`, `GET /verification/kyc/status`
- `POST /verification/kyc/submit`

### Any authenticated user (requireAuth)
- `POST /funding/fiat-to-ecop` — mint ECOP from fiat request; stored as FundingRequest
- `POST /funding/ecop-to-fiat` — redeem ECOP to fiat request; stored as FundingRequest

### Business only (requireAuth + requireBusiness)
- `POST /verification/kyb/start`, `GET /verification/kyb/status`
- `POST /verification/kyb/submit`
- `POST /verification/credit-score/submit`, `GET /verification/credit-score/status`
- `POST /funding/requests`, `GET /funding/requests`, `GET /funding/requests/:id`

### OTC (requireAuth)
- `POST /otc/orders`, `GET /otc/orders`, `GET /otc/orders/:id`
- `PATCH /otc/orders/:id/status` (requireAdmin VERIFIER)

### Vaults (requireAuth)
- `GET /vaults`, `GET /vaults/:address`

### Webhooks (HMAC/Bearer verified — no JWT)
- `POST /webhooks/veriff`
- `POST /webhooks/sumsub`
- `POST /webhooks/n8n/credit-score`

### Admin (requireAuth + requireAdmin)
- `GET /admin/users`, `GET /admin/users/:id` (VIEWER+)
- `POST /admin/roles`, `DELETE /admin/roles/:userId` (SUPER_ADMIN)
- `GET /admin/verifications`, `PUT /admin/verifications/:id/status`, `PUT /admin/verifications/:id/nft` (VIEWER+/VERIFIER+)
- `GET /admin/credit-score-requests`, `PUT /admin/credit-score-requests/:id/result`, `PUT /admin/credit-score-requests/:id/nft` (VIEWER+/VERIFIER+)
- `GET /admin/kyb/submissions`, `GET /admin/kyb/submissions/:id` (VIEWER+)
- `PATCH /admin/kyb/submissions/:id/status` (VERIFIER+)
- `GET /admin/kyc/submissions`, `GET /admin/kyc/submissions/:id` (VIEWER+)
- `PATCH /admin/kyc/submissions/:id/status` (VERIFIER+)
- `GET /admin/submissions/documents/:docId` (VIEWER+)
- `GET /admin/otc/orders`, `PUT /admin/otc/orders/:id/status` (VIEWER+/VERIFIER+)
- `GET /admin/rates`, `POST /admin/rates`, `DELETE /admin/rates/:pair` (VIEWER+/VERIFIER+)
- `GET /admin/funding/requests`, `PUT /admin/funding/requests/:id/review` (VIEWER+/VERIFIER+)
- `POST /admin/vaults` (VERIFIER+)

# Convexo Backend

Fastify 5 REST API for the Convexo Protocol — authentication, onboarding, KYC/KYB verification, credit scoring, OTC orders, and all user data operations.

[![Fastify](https://img.shields.io/badge/Fastify-5-black)](https://fastify.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-5-blue)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](https://postgresql.org)

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Modules](#api-modules)
- [Database Schema](#database-schema)
- [Webhook Configuration](#webhook-configuration)
- [Credit Score Flow](#credit-score-flow)
- [Admin Bootstrap](#admin-bootstrap)
- [Docker Deployment](#docker-deployment)
- [Deployment Checklist](#deployment-checklist)

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │         Fastify 5  (:3001)               │
                    │                                          │
                    │  Plugins: cors · rate-limit · multipart  │
                    │           swagger · jwt-auth             │
                    └────────────────┬────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
 ┌────────▼──────┐         ┌─────────▼──────┐        ┌────────▼────────┐
 │  13 Modules   │         │  3 Webhooks    │        │  Swagger /docs  │
 │  (JWT-gated)  │         │  (HMAC-signed) │        │  (dev only)     │
 └────────┬──────┘         └─────────┬──────┘        └─────────────────┘
          │                          │
 ┌────────▼──────────────────────────▼──────┐
 │            Prisma 5  +  PostgreSQL 16     │
 │           + Redis (ioredis)               │
 └───────────────────────────────────────────┘
          │
 ┌────────▼────────────────────────────────────────────────┐
 │  External Services                                       │
 │  Veriff (KYC) · Sumsub (KYB) · Pinata (IPFS)           │
 │  n8n (AI credit score) · Resend (email) · Telegram      │
 │  viem (blockchain reads — reputation sync)              │
 └─────────────────────────────────────────────────────────┘
```

### Auth Flow

```
Client                           Backend                       Blockchain
  │                                │                               │
  │   GET /auth/nonce?address=0x.. │                               │
  │──────────────────────────────▶ │                               │
  │   ◀── { nonce }                │                               │
  │                                │                               │
  │   POST /auth/verify            │                               │
  │   { message, signature,        │                               │
  │     address, chainId }         │                               │
  │──────────────────────────────▶ │                               │
  │                                │  verify EIP-4361 signature    │
  │                                │  upsert User in DB            │
  │   ◀── { accessToken,           │                               │
  │          refreshToken }        │                               │
  │                                │                               │
  │   POST /auth/refresh           │  (when accessToken expires)   │
  │   { refreshToken }             │                               │
  │──────────────────────────────▶ │                               │
  │   ◀── { accessToken }          │                               │
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Fastify 5 + TypeScript |
| ORM | Prisma 5 + PostgreSQL 16 |
| Cache | Redis (ioredis 5) |
| Auth | SIWE (EIP-4361) · JWT · Refresh tokens |
| Validation | Zod (env + schemas) |
| Logging | Pino + pino-pretty |
| API Docs | @fastify/swagger + @fastify/swagger-ui |
| Rate Limiting | @fastify/rate-limit |
| File Uploads | @fastify/multipart |
| Email | Resend |
| Storage | Pinata IPFS SDK |
| KYC | Veriff REST API |
| KYB | Sumsub REST API |
| AI Credit Score | n8n webhook automation |
| Notifications | Telegram Bot API |
| Blockchain | viem (reputation reads from Base mainnet) |
| Containerization | Docker + Docker Compose |

---

## Project Structure

```
convexo-backend/
├── src/
│   ├── index.ts                    # Entry point — connect DB + Redis, start server
│   ├── app.ts                      # Fastify app factory — plugins + routes registration
│   ├── types.ts                    # Global type augmentations (rawBody on FastifyRequest)
│   │
│   ├── config/
│   │   ├── env.ts                  # Zod-validated environment config (fails fast on bad env)
│   │   ├── database.ts             # Prisma client connect/disconnect
│   │   └── redis.ts                # ioredis singleton
│   │
│   ├── plugins/
│   │   ├── auth.ts                 # JWT plugin + requireAuth decorator
│   │   ├── cors.ts                 # CORS (allow frontend origin)
│   │   ├── multipart.ts            # File upload config
│   │   ├── rateLimit.ts            # Rate limiting (global + per-route overrides)
│   │   └── swagger.ts              # OpenAPI spec + Swagger UI at /docs
│   │
│   ├── middleware/
│   │   └── requireRole.ts          # SUPER_ADMIN / VERIFIER role check
│   │
│   ├── modules/
│   │   ├── auth/                   # SIWE sign-in, nonce, logout, refresh
│   │   ├── users/                  # GET/PUT/DELETE /users/me
│   │   ├── onboarding/             # 5-step onboarding state machine
│   │   ├── profile/                # Individual or Business profile
│   │   ├── verification/           # Veriff · Sumsub · n8n credit score
│   │   ├── bank-accounts/          # AES-256 encrypted bank accounts
│   │   ├── contacts/               # Wallet address book
│   │   ├── rates/                  # Exchange rate cache
│   │   ├── otc/                    # OTC trade orders
│   │   ├── documents/              # IPFS document references
│   │   ├── reputation/             # NFT tier sync (chain → DB)
│   │   ├── funding/                # Vault funding requests (Business Tier 3)
│   │   ├── notifications/          # Email + Telegram helpers
│   │   └── admin/                  # Role management + user admin
│   │
│   ├── webhooks/
│   │   ├── veriff.webhook.ts       # HMAC-SHA256 (x-hmac-signature)
│   │   ├── sumsub.webhook.ts       # HMAC-SHA256-HEX (x-payload-digest)
│   │   └── n8n.webhook.ts          # Bearer token auth (N8N_WEBHOOK_SECRET)
│   │
│   └── shared/
│       ├── errors.ts               # AppError class with statusCode + code
│       └── logger.ts               # Pino logger instance
│
├── prisma/
│   └── schema.prisma               # 13 models, 17 enums
│
├── docker-compose.yml              # PostgreSQL 16 + Redis + app
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (local or Docker)
- Redis (local or Docker)

### 1. Install dependencies

```bash
cd convexo-backend
npm install
```

### 2. Start infrastructure (Docker)

```bash
docker-compose up -d postgres redis
```

### 3. Configure environment

```bash
cp .env.example .env
# Fill in required values — see Environment Variables below
```

### 4. Run migrations

```bash
npm run db:migrate
# → creates all tables, runs any pending migrations
```

### 5. Start dev server

```bash
npm run dev
# → http://localhost:3001
# → http://localhost:3001/docs (Swagger UI)
```

### 6. Verify

```bash
curl http://localhost:3001/health
# → { "status": "ok" }
```

---

## NPM Scripts

| Script | Description |
|---|---|
| `npm run dev` | Dev server with hot-reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Start compiled production server |
| `npm run db:generate` | Generate Prisma client after schema changes |
| `npm run db:migrate` | Run migrations in development |
| `npm run db:migrate:prod` | Run migrations in production (no prompt) |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:reset` | Drop + recreate DB (development only) |

---

## Environment Variables

```env
# ─── App ──────────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3001
APP_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000

# ─── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@localhost:5432/convexo

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Auth (min 32 chars each) ─────────────────────────────────────────────────
JWT_SECRET=your_jwt_secret_minimum_32_characters_long
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# ─── KYC — Veriff ─────────────────────────────────────────────────────────────
VERIFF_API_KEY=your_veriff_api_key
VERIFF_BASE_URL=https://stationapi.veriff.com
VERIFF_WEBHOOK_SECRET=your_veriff_webhook_secret

# ─── KYB — Sumsub ─────────────────────────────────────────────────────────────
SUMSUB_APP_TOKEN=your_sumsub_app_token
SUMSUB_SECRET_KEY=your_sumsub_secret_key
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_WEBHOOK_SECRET=your_sumsub_webhook_secret

# ─── AI Credit Score — n8n ────────────────────────────────────────────────────
N8N_WEBHOOK_URL=https://your-n8n.com/webhook/credit-score
N8N_WEBHOOK_SECRET=your_n8n_shared_secret

# ─── Storage — Pinata IPFS ────────────────────────────────────────────────────
PINATA_JWT=your_pinata_jwt_token
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
PINATA_GATEWAY=your-gateway.mypinata.cloud

# ─── Notifications ────────────────────────────────────────────────────────────
RESEND_API_KEY=re_your_resend_api_key
RESEND_FROM_EMAIL=notifications@convexo.io
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_OPS_CHAT_ID=your_ops_chat_id
TELEGRAM_ADMIN_CHAT_ID=your_admin_chat_id

# ─── Blockchain (for reputation reads) ────────────────────────────────────────
BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/your_key

# ─── Encryption (bank accounts — 64-char hex) ────────────────────────────────
ENCRYPTION_KEY=your_64_char_hex_encryption_key

# ─── Exchange Rates ───────────────────────────────────────────────────────────
EXCHANGE_RATE_API_KEY=your_exchange_rate_api_key
RATES_CACHE_TTL_SECONDS=600

# ─── Admin Bootstrap ──────────────────────────────────────────────────────────
ADMIN_WALLET_ADDRESSES=0xABC...,0xDEF...
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection URL |
| `JWT_SECRET` | ✅ | JWT signing secret (min 32 chars) |
| `VERIFF_API_KEY` | ✅ | Veriff API key for KYC sessions |
| `VERIFF_WEBHOOK_SECRET` | ✅ | HMAC secret for Veriff webhooks |
| `SUMSUB_APP_TOKEN` | ✅ | Sumsub app token for KYB sessions |
| `SUMSUB_SECRET_KEY` | ✅ | Sumsub secret for API + HMAC signing |
| `SUMSUB_WEBHOOK_SECRET` | ✅ | HMAC secret for Sumsub webhooks |
| `N8N_WEBHOOK_URL` | ✅ | n8n webhook endpoint for credit score jobs |
| `N8N_WEBHOOK_SECRET` | ✅ | Bearer token for n8n callback auth |
| `PINATA_JWT` | ✅ | Pinata JWT for IPFS uploads |
| `ENCRYPTION_KEY` | ✅ | 64-char hex key for AES-256 bank account encryption |
| `ADMIN_WALLET_ADDRESSES` | | Comma-separated wallets bootstrapped as SUPER_ADMIN |
| `RESEND_API_KEY` | | Email notifications |
| `TELEGRAM_BOT_TOKEN` | | Telegram notifications |

---

## API Modules

**Base URL:** `http://localhost:3001`  
**Swagger UI:** `http://localhost:3001/docs` (development only)  
**Auth header:** `Authorization: Bearer <accessToken>`

### Response format

```typescript
// Success
{ data: T, message?: string }

// Error
{ error: string, code: string, statusCode: number }
```

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/nonce` | — | Get sign-in nonce for an address |
| POST | `/auth/verify` | — | Verify SIWE signature → issue tokens |
| POST | `/auth/refresh` | — | Refresh access token |
| POST | `/auth/logout` | ✅ | Invalidate refresh token |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | ✅ | Get current user |
| PUT | `/users/me` | ✅ | Update user (email, locale) |
| DELETE | `/users/me` | ✅ | Delete account (GDPR) |

### Onboarding

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/onboarding/status` | ✅ | Get current onboarding step + account type |
| POST | `/onboarding/type` | ✅ | Set INDIVIDUAL or BUSINESS |
| POST | `/onboarding/profile` | ✅ | Submit profile form |
| GET | `/onboarding/path` | ✅ | Get verification path guide |

### Profile

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profile` | ✅ | Get full profile (Individual or Business) |
| PUT | `/profile` | ✅ | Update profile fields |

### Verification

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/verification/veriff/session` | ✅ | Create Veriff KYC session |
| GET | `/verification/veriff/status` | ✅ | Get KYC status |
| POST | `/verification/sumsub/token` | ✅ | Get Sumsub SDK token |
| GET | `/verification/sumsub/status` | ✅ | Get KYB status |
| POST | `/verification/credit-score/submit` | ✅ | Upload 3 PDFs + business fields |
| GET | `/verification/credit-score/status` | ✅ | Poll credit score result |
| GET | `/verification/status` | ✅ | Summary of all verification statuses |

### Bank Accounts

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/bank-accounts` | ✅ | List bank accounts (decrypted) |
| POST | `/bank-accounts` | ✅ | Create bank account (AES-256 encrypted) |
| PUT | `/bank-accounts/:id` | ✅ | Update bank account |
| DELETE | `/bank-accounts/:id` | ✅ | Delete bank account |
| POST | `/bank-accounts/:id/default` | ✅ | Set as default account |

### Contacts

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/contacts` | ✅ | List contacts (search + type filter) |
| GET | `/contacts/:id` | ✅ | Get single contact |
| POST | `/contacts` | ✅ | Create contact |
| PUT | `/contacts/:id` | ✅ | Update contact |
| DELETE | `/contacts/:id` | ✅ | Delete contact |

> `GET /contacts` query params: `search` (name or address) · `type` (PROVIDER/FRIEND/CLIENT/FAMILY/OTHER) · `limit` · `offset`

### Exchange Rates

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/rates/:pair` | — | Get rate for pair (e.g. `USDC-ECOP`) |
| GET | `/rates` | — | List all cached rates |
| POST | `/admin/rates` | ✅ Admin | Set rate manually |
| DELETE | `/admin/rates/:pair` | ✅ Admin | Remove a rate |

### OTC Orders

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/otc` | ✅ | List my OTC orders |
| POST | `/otc` | ✅ | Create OTC order |
| DELETE | `/otc/:id` | ✅ | Cancel OTC order |
| GET | `/admin/otc` | ✅ Admin | List all OTC orders |
| PUT | `/admin/otc/:id` | ✅ Admin | Update OTC order status |

### Documents

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/documents` | ✅ | List my IPFS documents |
| POST | `/documents` | ✅ | Upload document to Pinata IPFS |
| GET | `/documents/:id` | ✅ | Get document metadata |
| DELETE | `/documents/:id` | ✅ | Remove document reference |

### Reputation

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/reputation` | ✅ | Get cached NFT tier from DB |
| POST | `/reputation/sync` | ✅ | Re-read NFT balances from chain → update cache |

### Funding (Business Tier 3)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/funding` | ✅ | List my funding requests |
| POST | `/funding` | ✅ | Create funding request |
| GET | `/funding/:id` | ✅ | Get funding request details |
| GET | `/admin/funding` | ✅ Admin | List all funding requests |
| PUT | `/admin/funding/:id` | ✅ Admin | Update funding request status |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/users` | ✅ Admin | List all users |
| GET | `/admin/users/:id` | ✅ Admin | Get user details |
| PUT | `/admin/users/:id` | ✅ Admin | Update user |
| GET | `/admin/verifications` | ✅ Admin | List all verifications |
| PUT | `/admin/verifications/:id` | ✅ Admin | Approve/reject verification |
| GET | `/admin/roles` | ✅ Admin | List admin roles |
| POST | `/admin/roles` | ✅ SUPER_ADMIN | Grant admin role |
| DELETE | `/admin/roles/:id` | ✅ SUPER_ADMIN | Revoke admin role |

### Webhooks

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/webhooks/veriff` | HMAC-SHA256 | Veriff KYC result callback |
| POST | `/webhooks/sumsub` | HMAC-SHA256-HEX | Sumsub KYB result callback |
| POST | `/webhooks/n8n/credit-score` | Bearer token | AI credit score result |

### System

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Health check |

---

## Database Schema

### Models

| Model | Description |
|---|---|
| `User` | Core user record — wallet address, auth method, onboarding step, account type |
| `IndividualProfile` | Personal details — name, email, DOB, nationality |
| `BusinessProfile` | Company details — name, tax ID, legal rep, company size |
| `Verification` | KYC / KYB / Humanity verification records (Veriff · Sumsub) |
| `CreditScoreRequest` | Credit score submissions + n8n results + IPFS CIDs |
| `ReputationCache` | Cached NFT tier (synced from blockchain via viem) |
| `BankAccount` | AES-256 encrypted bank account records |
| `Contact` | Wallet address book entries |
| `Document` | IPFS document references (via Pinata) |
| `OtcOrder` | OTC trade orders with status state machine |
| `FundingRequest` | Vault funding requests (Business Tier 3 only) |
| `ExchangeRate` | Cached exchange rates (USD/COP, USDC/ECOP, etc.) |
| `NotificationLog` | Email + Telegram notification audit log |
| `AdminRole` | Admin role assignments (VIEWER · VERIFIER · SUPER_ADMIN) |

### Key enums

| Enum | Values |
|---|---|
| `OnboardingStep` | NOT_STARTED · TYPE_SELECTED · PROFILE_COMPLETE · VERIFICATION_PENDING · COMPLETE |
| `AccountType` | INDIVIDUAL · BUSINESS |
| `AuthMethod` | WALLET · EMAIL · PASSKEY · GOOGLE |
| `VerificationStatus` | PENDING · APPROVED · REJECTED · EXPIRED |
| `CreditScoreStatus` | PENDING · PROCESSING · COMPLETE · FAILED |
| `AdminRoleType` | VIEWER · VERIFIER · SUPER_ADMIN |

---

## Webhook Configuration

### Veriff

```
URL:       https://your-api.com/webhooks/veriff
Algorithm: HMAC_SHA256
Header:    x-hmac-signature
```

### Sumsub

```
URL:       https://your-api.com/webhooks/sumsub
Algorithm: HMAC_SHA256_HEX
Header:    x-payload-digest
```

### n8n (credit score callback)

```
The backend fires N8N_WEBHOOK_URL with:
{
  requestId, userId, walletAddress,
  incomeStatementCid, balanceSheetCid, cashFlowCid,
  annualRevenue, netProfit, totalAssets, totalLiabilities,
  employeeCount, yearsOperating, existingDebt, monthlyExpenses,
  callbackUrl: APP_URL/webhooks/n8n/credit-score
}

n8n sends result back with:
  Authorization: Bearer N8N_WEBHOOK_SECRET
{
  requestId, approved, score, rating,
  maxCreditLimit, analysisNotes, rejectionReason
}
```

If `approved && score >= 70`, the backend mints the Tier 3 (`Ecreditscoring`) NFT via the smart contract `safeMintWithIdentifier`.

---

## Credit Score Flow

```
POST /verification/credit-score/submit
Content-Type: multipart/form-data

Files (required):
  income_statement   — Income Statement (PDF/Excel)
  balance_sheet      — Balance Sheet (PDF/Excel)
  cash_flow          — Cash Flow Statement (PDF/Excel)

Fields (required):
  period             — e.g. "2024" or "Q3-2024"
  annualRevenue      — string (e.g. "500000")
  netProfit          — string
  totalAssets        — string
  totalLiabilities   — string
  employeeCount      — integer
  yearsOperating     — integer
  existingDebt       — string
  monthlyExpenses    — string

Fields (optional):
  additionalContext  — max 2000 chars
```

Files are uploaded to **Pinata IPFS**. n8n processes the analysis asynchronously. The frontend polls `GET /verification/credit-score/status` every 30 seconds until status is `COMPLETE` or `FAILED`.

---

## Admin Bootstrap

Wallets listed in `ADMIN_WALLET_ADDRESSES` are automatically seeded as `SUPER_ADMIN` on their **first sign-in**:

```env
ADMIN_WALLET_ADDRESSES=0xABC...,0xDEF...
```

Admin roles: `VIEWER` (read-only) · `VERIFIER` (can approve verifications) · `SUPER_ADMIN` (full access + role management).

---

## Docker Deployment

### Local — infrastructure only (recommended for development)

```bash
# Start PostgreSQL + Redis
docker-compose up -d postgres redis

# Run migrations
npm run db:migrate

# Start API with hot-reload
npm run dev
```

### Full Docker stack

```bash
# Build and start everything
docker-compose up -d --build

# Run migrations
docker-compose exec app npm run db:migrate:prod

# Follow logs
docker-compose logs -f app
```

### Docker Compose services

| Service | Port | Description |
|---|---|---|
| `postgres` | 5432 | PostgreSQL 16 |
| `redis` | 6379 | Redis 7 |
| `app` | 3001 | Fastify API |

---

## Deployment Checklist

### Pre-deployment
- [ ] All environment variables set (see [DEPLOY.md](./DEPLOY.md))
- [ ] `DATABASE_URL` points to production PostgreSQL
- [ ] `ENCRYPTION_KEY` is a secure 64-char hex string
- [ ] `JWT_SECRET` is at least 32 chars
- [ ] Veriff webhook registered at `APP_URL/webhooks/veriff`
- [ ] Sumsub webhook registered at `APP_URL/webhooks/sumsub`
- [ ] n8n workflow points `callbackUrl` back to `APP_URL/webhooks/n8n/credit-score`

### Deployment
- [ ] `npm run build` — TypeScript compile passes
- [ ] `npm run db:migrate:prod` — migrations applied
- [ ] `npm run start` — server starts, `/health` returns 200

### Post-deployment
- [ ] Swagger UI disabled in production (`NODE_ENV=production`)
- [ ] Admin wallets bootstrapped via `ADMIN_WALLET_ADDRESSES`
- [ ] Test SIWE auth flow end-to-end
- [ ] Test at least one webhook delivery (Veriff or Sumsub)

See [DEPLOY.md](./DEPLOY.md) for full production setup guide.

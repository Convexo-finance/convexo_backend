# Convexo Backend API

Production-ready REST API for the Convexo Protocol. Built with **Fastify 5**, **Prisma**, **PostgreSQL**, and **Redis**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Convexo Backend                          │
│                                                                 │
│  ┌──────────┐   ┌───────────┐   ┌──────────────┐              │
│  │  Fastify │   │  Prisma   │   │    Redis     │              │
│  │   API    │──▶│ (Postgres)│   │ (Nonce/JWT   │              │
│  │          │   │           │   │  Cache)      │              │
│  └────┬─────┘   └───────────┘   └──────────────┘              │
│       │                                                         │
│  ┌────▼────────────────────────────────────────────┐           │
│  │                    Modules                       │           │
│  │  auth │ users │ onboarding │ profile │ verific. │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
│  ┌──────────────────────────────────────────────────┐          │
│  │                   Webhooks                        │          │
│  │     /webhooks/veriff  /webhooks/sumsub            │          │
│  │     /webhooks/n8n/credit-score                    │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Account Type Flow

```
User connects wallet
        │
        ▼
  ┌─────────────┐
  │  Onboarding │
  │  TYPE SELECT│
  └──────┬──────┘
         │
    ┌────┴────┐
    ▼         ▼
INDIVIDUAL  BUSINESS
    │             │
    ▼             ▼
Profile       Profile
    │             │
    ▼             ▼
 Veriff        Sumsub
 (KYC)         (KYB)
    │             │
    ▼             ▼
LP_COMPLETE   Credit Score
              (n8n + docs)
                  │
                  ▼
               COMPLETE
```

---

## OnboardingStep State Machine

```
NOT_STARTED
    │
    ▼
TYPE_SELECTED  ◄─── POST /onboarding/type
    │
    ▼
PROFILE_COMPLETE  ◄─── POST /onboarding/profile
    │
    ▼
HUMANITY_PENDING  (reserved for ZKPassport)
    │
    ▼
HUMANITY_COMPLETE
    │
    ├──[INDIVIDUAL]──▶ KYC_PENDING  ◄─── POST /verification/kyc/start
    │                       │
    │                       ▼
    │                  LP_COMPLETE  ◄─── Veriff webhook
    │
    └──[BUSINESS]───▶ KYB_PENDING  ◄─── POST /verification/kyb/start
                           │
                           ▼
                      LP_COMPLETE  ◄─── Sumsub webhook
                           │
                           ▼
                  CREDIT_SCORE_PENDING  ◄─── POST /verification/credit-score/submit
                           │
                           ▼
                        COMPLETE  ◄─── n8n callback
```

---

## NFT Tier System

| Tier | Name            | Required For                        |
|------|-----------------|-------------------------------------|
| 0    | None            | Basic access                        |
| 1    | ConvexoPassport | Treasury, Investments               |
| 2    | LP Individual   | LP Pools (Individual path)          |
| 2    | LP Business     | LP Pools (Business path)            |
| 3    | Ecreditscoring  | Vault creation, Funding             |

---

## Tech Stack

| Layer            | Technology                          |
|------------------|-------------------------------------|
| Framework        | Fastify 5 + TypeScript              |
| ORM              | Prisma 5 + PostgreSQL 16            |
| Cache/Nonce      | ioredis 5 + Redis 7                 |
| Auth             | SIWE (Sign-In With Ethereum) + JWT  |
| KYC (Individual) | Veriff                              |
| KYB (Business)   | Sumsub                              |
| Credit Score     | n8n automation                      |
| Documents        | Pinata IPFS                         |
| Email            | Resend                              |
| Admin Alerts     | Telegram Bot API                    |
| Validation       | Zod                                 |
| Blockchain       | viem (read-only)                    |

---

## Project Structure

```
convexo-backend/
├── prisma/
│   └── schema.prisma              # 15 models, 14 enums
├── src/
│   ├── index.ts                   # Entry point + graceful shutdown
│   ├── app.ts                     # Fastify factory + plugins + routes
│   ├── types.d.ts                 # JWT payload + FastifyRequest augmentations
│   ├── config/
│   │   ├── env.ts                 # Zod-validated env (exits on error)
│   │   ├── database.ts            # Prisma singleton
│   │   ├── redis.ts               # ioredis client + key helpers + TTL constants
│   │   └── chains.ts              # viem Chain configs (Base, Unichain, etc.)
│   ├── shared/
│   │   ├── errors.ts              # AppError hierarchy
│   │   ├── logger.ts              # pino + pino-pretty in dev
│   │   ├── pagination.ts          # Cursor/offset pagination helpers
│   │   └── viem.ts               # Lazy public clients per chainId
│   ├── plugins/
│   │   ├── auth.ts               # @fastify/jwt
│   │   ├── cors.ts
│   │   ├── multipart.ts          # @fastify/multipart (20MB)
│   │   ├── rateLimit.ts          # Redis-backed rate limiting
│   │   └── swagger.ts            # OpenAPI 3.0 (/docs in dev)
│   ├── middleware/
│   │   ├── requireAuth.ts        # JWT verify + Redis blacklist
│   │   ├── requireOnboarded.ts   # Blocks if not COMPLETE
│   │   ├── requireAccountType.ts # requireIndividual / requireBusiness
│   │   ├── requireAdmin.ts       # VIEWER < VERIFIER < SUPER_ADMIN
│   │   └── requireTier.ts        # NFT tier gate
│   ├── modules/
│   │   ├── auth/                 # SIWE nonce, verify, JWT
│   │   ├── users/                # /users/me CRUD
│   │   ├── onboarding/           # Type + profile submission
│   │   ├── profile/              # Individual & Business profiles
│   │   ├── notifications/        # Resend email + Telegram alerts (internal service)
│   │   ├── verification/
│   │   │   ├── verification.schema.ts
│   │   │   ├── verification.service.ts   # Aggregate status
│   │   │   ├── verification.controller.ts
│   │   │   ├── verification.routes.ts
│   │   │   ├── veriff.service.ts         # KYC (Individual)
│   │   │   ├── sumsub.service.ts         # KYB (Business)
│   │   │   └── credit-score.service.ts   # Pinata + n8n
│   │   ├── bank-accounts/        # AES-256-GCM encrypted account numbers
│   │   ├── contacts/             # Wallet address book
│   │   ├── rates/                # Admin-set exchange rates (Redis-cached 10 min)
│   │   ├── otc/                  # OTC orders with auto amountOut calc
│   │   ├── documents/            # Pinata IPFS uploads with SHA-256 hash
│   │   ├── reputation/           # On-chain NFT tier sync via viem
│   │   ├── funding/              # Business funding requests
│   │   └── admin/                # User mgmt, verif overrides, role management
│   └── webhooks/
│       ├── veriff.webhook.ts     # HMAC-verified Veriff callbacks
│       ├── sumsub.webhook.ts     # HMAC-verified Sumsub callbacks
│       └── n8n.webhook.ts        # Bearer-verified n8n credit score callback
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Quick Start

### 1. Install dependencies

```bash
cd convexo-backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — minimum required:
#   DATABASE_URL
#   REDIS_URL
#   JWT_SECRET (min 32 chars)
```

### 3. Start PostgreSQL + Redis

```bash
docker-compose up -d postgres redis
```

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. Start development server

```bash
npm run dev
```

API: `http://localhost:3001`
Swagger: `http://localhost:3001/docs`

---

## NPM Scripts

| Script                    | Description                                      |
|---------------------------|--------------------------------------------------|
| `npm run dev`             | Hot reload dev server (tsx watch)                |
| `npm run build`           | Compile TypeScript → `dist/`                     |
| `npm run start`           | Run compiled production build                    |
| `npm run db:migrate`      | Apply migrations (dev — creates migration files) |
| `npm run db:migrate:prod` | Apply migrations (production — no prompts)       |
| `npm run db:generate`     | Regenerate Prisma client after schema changes    |
| `npm run db:studio`       | Prisma Studio (visual database browser)          |
| `npm run db:reset`        | Drop and recreate database (dev only)            |

---

## Environment Variables

| Variable                   | Required | Description                                         |
|----------------------------|----------|-----------------------------------------------------|
| `DATABASE_URL`             | ✅       | PostgreSQL connection string                        |
| `REDIS_URL`                | ✅       | Redis connection URL                                |
| `JWT_SECRET`               | ✅       | Min 32 chars — signs all JWT tokens                 |
| `JWT_EXPIRES_IN`           |          | Access token TTL (default: `7d`)                    |
| `JWT_REFRESH_EXPIRES_IN`   |          | Refresh token TTL (default: `30d`)                  |
| `APP_URL`                  |          | Public API URL (default: `http://localhost:3001`)   |
| `FRONTEND_URL`             |          | Frontend URL used in email links                    |
| `PINATA_JWT`               |          | Pinata API JWT — credit score document uploads      |
| `PINATA_GATEWAY`           |          | Pinata IPFS gateway domain                          |
| `VERIFF_API_KEY`           |          | Veriff API key — Individual KYC                     |
| `VERIFF_WEBHOOK_SECRET`    |          | Veriff HMAC webhook secret                          |
| `SUMSUB_APP_TOKEN`         |          | Sumsub app token — Business KYB                     |
| `SUMSUB_SECRET_KEY`        |          | Sumsub secret key                                   |
| `SUMSUB_WEBHOOK_SECRET`    |          | Sumsub HMAC webhook secret                          |
| `N8N_WEBHOOK_URL`          |          | n8n automation trigger URL (credit score)           |
| `N8N_WEBHOOK_SECRET`       |          | Bearer token for n8n callback auth                  |
| `RESEND_API_KEY`           |          | Resend email API key                                |
| `RESEND_FROM_EMAIL`        |          | Sender address (default: `notifications@convexo.io`) |
| `TELEGRAM_BOT_TOKEN`       |          | Telegram bot token for admin alerts                 |
| `TELEGRAM_ADMIN_CHAT_ID`   |          | Telegram chat ID for admin notifications            |
| `ADMIN_WALLET_ADDRESSES`   |          | Comma-separated wallets seeded as SUPER_ADMIN       |
| `BASE_MAINNET_RPC_URL`     |          | Base mainnet RPC endpoint                           |
| `BASE_SEPOLIA_RPC_URL`     |          | Base Sepolia RPC endpoint                           |
| `ENCRYPTION_KEY`           |          | 64-char hex key for bank account number encryption  |

---

## API Reference

### Auth

| Method | Path          | Auth | Description                        |
|--------|---------------|------|------------------------------------|
| GET    | `/auth/nonce` | —    | Get SIWE nonce for a wallet address |
| POST   | `/auth/verify`| —    | Verify SIWE signature, receive JWT |
| POST   | `/auth/logout`| ✅   | Blacklist current JWT              |

### Users

| Method | Path        | Auth | Description       |
|--------|-------------|------|-------------------|
| GET    | `/users/me` | ✅   | Get current user  |
| PUT    | `/users/me` | ✅   | Update user       |
| DELETE | `/users/me` | ✅   | Delete account    |

### Onboarding

| Method | Path                  | Auth | Description                            |
|--------|-----------------------|------|----------------------------------------|
| GET    | `/onboarding/status`  | ✅   | Get current step + what to do next     |
| POST   | `/onboarding/type`    | ✅   | Set account type (INDIVIDUAL/BUSINESS) |
| POST   | `/onboarding/profile` | ✅   | Submit individual or business profile  |

### Profile

| Method | Path       | Auth | Description              |
|--------|------------|------|--------------------------|
| GET    | `/profile` | ✅   | Get profile (type-aware) |
| PUT    | `/profile` | ✅   | Update profile           |

### Verification

| Method | Path                                | Auth | Type       | Description                       |
|--------|-------------------------------------|------|------------|-----------------------------------|
| GET    | `/verification/status`              | ✅   | Any        | All verification statuses         |
| POST   | `/verification/kyc/start`           | ✅   | Individual | Start Veriff KYC → returns URL    |
| GET    | `/verification/kyc/status`          | ✅   | Individual | KYC status                        |
| POST   | `/verification/kyb/start`           | ✅   | Business   | Start Sumsub KYB → SDK token      |
| GET    | `/verification/kyb/status`          | ✅   | Business   | KYB status                        |
| POST   | `/verification/credit-score/submit` | ✅   | Business   | Upload 3 docs + form (multipart)  |
| GET    | `/verification/credit-score/status` | ✅   | Business   | Credit score request status       |

### Reputation

| Method | Path               | Auth | Description                                  |
|--------|--------------------|------|----------------------------------------------|
| GET    | `/reputation`      | ✅   | Get cached NFT tier for current user         |
| POST   | `/reputation/sync` | ✅   | Read NFT balances from chain, update cache   |

> `POST /reputation/sync` accepts `{ chainId?: number }` (defaults to 8453 — Base Mainnet).
> Reads `balanceOf` for all 4 NFT contracts and computes tier + permissions.

### Funding (Business only)

| Method | Path                                    | Auth | Role      | Description                        |
|--------|-----------------------------------------|------|-----------|------------------------------------|
| POST   | `/funding/requests`                     | ✅   | Business  | Submit a funding request           |
| GET    | `/funding/requests`                     | ✅   | Business  | List my funding requests           |
| GET    | `/funding/requests/:id`                 | ✅   | Business  | Get a single funding request       |
| GET    | `/admin/funding/requests`               | ✅   | VIEWER+   | List all funding requests          |
| PUT    | `/admin/funding/requests/:id/review`    | ✅   | VERIFIER+ | Approve / reject a funding request |

### Admin Panel

**Users**

| Method | Path                | Auth | Role    | Description              |
|--------|---------------------|------|---------|--------------------------|
| GET    | `/admin/users`      | ✅   | VIEWER+ | List users (searchable)  |
| GET    | `/admin/users/:id`  | ✅   | VIEWER+ | Get full user details    |

**Admin Roles**

| Method | Path                     | Auth | Role        | Description           |
|--------|--------------------------|------|-------------|-----------------------|
| POST   | `/admin/roles`           | ✅   | SUPER_ADMIN | Grant admin role      |
| DELETE | `/admin/roles/:userId`   | ✅   | SUPER_ADMIN | Revoke admin role     |

**Verifications**

| Method | Path                               | Auth | Role      | Description                         |
|--------|------------------------------------|------|-----------|-------------------------------------|
| GET    | `/admin/verifications`             | ✅   | VIEWER+   | List all verifications              |
| PUT    | `/admin/verifications/:id/status`  | ✅   | VERIFIER+ | Manually override verification      |
| PUT    | `/admin/verifications/:id/nft`     | ✅   | VERIFIER+ | Record NFT token ID after minting   |

**Credit Score**

| Method | Path                                       | Auth | Role      | Description                           |
|--------|--------------------------------------------|------|-----------|---------------------------------------|
| GET    | `/admin/credit-score-requests`             | ✅   | VIEWER+   | List all credit score requests        |
| PUT    | `/admin/credit-score-requests/:id/result`  | ✅   | VERIFIER+ | Manually set score result             |
| PUT    | `/admin/credit-score-requests/:id/nft`     | ✅   | VERIFIER+ | Record NFT token ID after minting     |

### Exchange Rates

| Method | Path                | Auth  | Role      | Description                       |
|--------|---------------------|-------|-----------|-----------------------------------|
| GET    | `/rates`            | —     | Public    | List all configured rates         |
| GET    | `/rates/:pair`      | —     | Public    | Get rate for pair (e.g. USD-COP)  |
| POST   | `/admin/rates`      | ✅    | VERIFIER+ | Create or update a rate           |
| DELETE | `/admin/rates/:pair`| ✅    | VERIFIER+ | Remove a rate pair                |

> Rates are Redis-cached for 10 minutes. `POST /admin/rates` busts the cache immediately.
> Pair format: `FROM-TO` in uppercase, e.g. `USD-COP`, `ETH-USDC`, `BTC-USD`.

### OTC Orders

| Method | Path                          | Auth | Role      | Description                       |
|--------|-------------------------------|------|-----------|-----------------------------------|
| POST   | `/otc/orders`                 | ✅   | Any       | Submit a new OTC order            |
| GET    | `/otc/orders`                 | ✅   | Any       | List my OTC orders                |
| GET    | `/otc/orders/:id`             | ✅   | Any       | Get a single OTC order            |
| GET    | `/admin/otc/orders`           | ✅   | VIEWER+   | List all OTC orders               |
| PUT    | `/admin/otc/orders/:id/status`| ✅   | VERIFIER+ | Update order status               |

> On order creation: `amountOut` is auto-calculated from admin-set rates (if the pair is configured). Admin + user are notified automatically via Telegram and email. Status changes also trigger email notifications to the user.

### Documents

| Method | Path             | Auth | Description                                           |
|--------|------------------|------|-------------------------------------------------------|
| POST   | `/documents`     | ✅   | Upload a document to Pinata IPFS (multipart)          |
| GET    | `/documents`     | ✅   | List my documents (filter by `category`)              |
| GET    | `/documents/:id` | ✅   | Get a document record                                 |
| DELETE | `/documents/:id` | ✅   | Delete document record (IPFS content stays immutable) |

> Upload accepts `multipart/form-data` with fields: `file` (required) and `category` (optional, one of: GENERAL, KYC_DOCUMENT, KYB_DOCUMENT, INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW, etc.).

### Bank Accounts

| Method | Path                         | Auth | Description                      |
|--------|------------------------------|------|----------------------------------|
| GET    | `/bank-accounts`             | ✅   | List all bank accounts           |
| POST   | `/bank-accounts`             | ✅   | Add a bank account               |
| PUT    | `/bank-accounts/:id`         | ✅   | Update a bank account            |
| DELETE | `/bank-accounts/:id`         | ✅   | Delete a bank account            |
| POST   | `/bank-accounts/:id/default` | ✅   | Set as default account           |

> Account numbers are AES-256-GCM encrypted at rest and returned masked (`****4521`). Requires `ENCRYPTION_KEY` (64-char hex) in `.env`.

### Contacts

| Method | Path            | Auth | Description                           |
|--------|-----------------|------|---------------------------------------|
| GET    | `/contacts`     | ✅   | List contacts (search + type filter)  |
| GET    | `/contacts/:id` | ✅   | Get a single contact                  |
| POST   | `/contacts`     | ✅   | Create a contact                      |
| PUT    | `/contacts/:id` | ✅   | Update a contact                      |
| DELETE | `/contacts/:id` | ✅   | Delete a contact                      |

> `GET /contacts` accepts: `search` (name or address), `type` (PROVIDER/FRIEND/CLIENT/FAMILY/OTHER), `limit`, `offset`.

### Webhooks (verified internally, no JWT required)

| Method | Path                          | Verified By  |
|--------|-------------------------------|--------------|
| POST   | `/webhooks/veriff`            | HMAC-SHA256  |
| POST   | `/webhooks/sumsub`            | HMAC-SHA256  |
| POST   | `/webhooks/n8n/credit-score`  | Bearer token |

### System

| Method | Path      | Description  |
|--------|-----------|--------------|
| GET    | `/health` | Health check |

---

## Credit Score Submission

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

The files are uploaded to Pinata IPFS, then n8n is triggered asynchronously. The result arrives via webhook at `/webhooks/n8n/credit-score`.

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
  { requestId, userId, walletAddress,
    incomeStatementCid, balanceSheetCid, cashFlowCid,
    annualRevenue, netProfit, ...,
    callbackUrl: APP_URL/webhooks/n8n/credit-score }

n8n sends result back with:
  Authorization: Bearer N8N_WEBHOOK_SECRET
  { requestId, approved, score, rating,
    maxCreditLimit, analysisNotes, rejectionReason }
```

---

## Docker Deployment

### Local infrastructure only

```bash
docker-compose up -d postgres redis
npm run dev
```

### Full Docker stack

```bash
docker-compose up -d --build
docker-compose exec app npm run db:migrate:prod
docker-compose logs -f app
```

---

## Database Schema

| Model                | Description                                      |
|----------------------|--------------------------------------------------|
| `User`               | Core user record (wallet, auth, onboarding step) |
| `IndividualProfile`  | Personal details for individual accounts         |
| `BusinessProfile`    | Company details + legal rep info                 |
| `ReputationCache`    | Cached NFT balances and tier permissions         |
| `Verification`       | KYC / KYB / Humanity verification records        |
| `CreditScoreRequest` | Credit score submissions + n8n results           |
| `BankAccount`        | Encrypted bank account records per user          |
| `Contact`            | Address book (wallet addresses)                  |
| `Document`           | IPFS document references                         |
| `OtcOrder`           | OTC trade orders                                 |
| `FundingRequest`     | Vault funding requests (Business only)           |
| `NotificationLog`    | Email/Telegram notification audit log            |
| `ExchangeRate`       | Cached exchange rates                            |
| `AdminRole`          | Admin assignments (VIEWER, VERIFIER, SUPER_ADMIN)|

---

## Supported Chains

| Chain            | Chain ID |
|------------------|----------|
| Base Mainnet     | 8453     |
| Base Sepolia     | 84532    |
| Unichain Mainnet | 130      |
| Unichain Sepolia | 1301     |
| Ethereum Sepolia | 11155111 |

---

## Admin Bootstrap

Wallets in `ADMIN_WALLET_ADDRESSES` are seeded as `SUPER_ADMIN` on first login:

```env
ADMIN_WALLET_ADDRESSES="0xABC...,0xDEF..."
```
# convexo_backend

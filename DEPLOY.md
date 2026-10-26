# Convexo Backend — Deployment Guide

> Updated: 2026-10-26 | Stack: Fastify 5 + PostgreSQL 16 + Redis 7 | Hosted: **Vercel (API) + Supabase (DB)** — Railway retired

---

## Production hosting — Vercel + Supabase (since 2026-10-26)

Railway is retired (the service and its Redis were gone by 2026-10-26; nothing had launched, so
nothing was migrated). Production starts clean:

| Piece | Where | Notes |
|---|---|---|
| API (Fastify) | Vercel project `convexo-backend`, domain `api.convexo.xyz` | Zero-config Fastify: Vercel detects `src/index.ts` and its `app.listen()` |
| Postgres | **New** Supabase project in the `convexo.finance@gmail.com` account | `DATABASE_URL` = transaction pooler :6543 `?pgbouncer=true`; `DIRECT_URL` = session pooler :5432 |
| Redis | Upstash (Vercel Marketplace) | `REDIS_URL=rediss://…` — ioredis works unchanged |
| Pool keeper | Vercel Cron → `GET /pool/keeper/tick` every 5 min (`vercel.json`) | Needs `CRON_SECRET`; the `setInterval` loop only runs off-Vercel. A 5-minute schedule needs a Pro team (Hobby = daily) |

**Migrations are a release step, not a build step** (a build-time migrate would let preview
builds touch the production DB). From a trusted machine, with `DIRECT_URL` for the new project:

```bash
npx prisma migrate deploy        # creates the full schema, incl. 20260721000000_enable_rls
```

**Env vars** — names in `src/config/env.ts`. Fresh launch → generate new secrets, don't copy
Railway's: `JWT_SECRET` (`openssl rand -hex 32`), `ENCRYPTION_KEY` (64 hex — losing it makes
stored bank accounts unreadable, so store it in the password manager), `CRON_SECRET`,
`DOCS_SECRET`, and a new `KEEPER_PRIVATE_KEY` wallet funded with testnet ETH.
Set `APP_URL=https://api.convexo.xyz`, `FRONTEND_URL`, `SIWE_ALLOWED_DOMAINS`.

**Document storage — Supabase Storage, direct uploads.** Vercel caps request (and response)
bodies at 4.5 MB, so KYB / KYC / credit-score files never transit the API:

```
browser ── POST /verification/<flow>/upload-url {docType|fieldName, filename, mimeType, sizeBytes}
        ◄─ { documentId, upload: { signedUrl, token, path, headers, expiresIn: 7200 } }   (row = PENDING)
browser ── PUT signedUrl  (raw file body, content-type + x-upsert:false)  ──► Supabase Storage
browser ── POST /verification/<flow>/documents/:documentId/confirm
           API downloads with the service role, checks size / content-type / magic bytes,
           stores sha256, row → UPLOADED; KYB + credit-score then run Claude extraction
admin   ── GET /admin/submissions/documents/:docId/url  → { url (60 s signed), filename, … }
           (GET /admin/submissions/documents/:docId still works: 302 to the same signed URL)
```

`<flow>` = `kyb` | `credit-score` (business, `KYB_CUSTOM_FLOW`) | `kyc` (individual; then
`POST /verification/kyc/submit` with no body). Limits: 20 MB per file; KYB + credit-score are
PDF-only, KYC accepts PDF/JPEG/PNG — enforced at intent, by the bucket itself, and on confirm.
Object keys: `<userId>/<submissionId>/<uuid>-<safeName>`. Bytes are not app-encrypted any more:
confidentiality = private bucket + deny-all client RLS + service-role key server-only + Supabase
at-rest encryption. Multipart remains only on the public Pinata route `POST /documents` (≤ 4 MB).

One-time infra per Supabase project (operator, after `prisma migrate deploy`):

```bash
psql "$DIRECT_URL" -f supabase/storage.sql   # private `documents` bucket + restrictive deny policy
```

Env: `SUPABASE_URL` (`https://<ref>.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY` (server-only
secret — Vercel "Sensitive"), optional `SUPABASE_STORAGE_BUCKET` (default `documents`).
The protocol frontend needs **no** Supabase env var — it PUTs to the `signedUrl` the API returns.

**Cut-over checklist**
1. Supabase project created (convexo.finance) → `prisma migrate deploy` → advisors clean
2. Vercel project linked to this repo (root = repo), env vars set, Upstash attached
3. `supabase/storage.sql` applied; preview deploy → `/health`, SIWE login, `/rates`, a KYB upload **> 4.5 MB** (proves the direct path), admin document download
4. `api.convexo.xyz` → production; `NEXT_PUBLIC_API_URL` updated in protocol app, admin
5. Update STATE.md §2, AUTH.md, CLAUDE.md; delete `railway.toml`, `start.sh`, `Dockerfile` (keep docker-compose for local)

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| PostgreSQL | 16 |
| Redis | 7 |
| Docker | 24+ (optional) |
| npm | latest |

---

## Local Development

### 1. Install Dependencies

```bash
cd convexo-backend
npm install
```

### 2. Environment Variables

Copy `.env.example` → `.env` and fill in all values:

```env
# Server
NODE_ENV=development
PORT=3001
APP_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000

# Database (Railway reference on prod: ${{Postgres.DATABASE_URL}})
DATABASE_URL=postgresql://convexo:secret@localhost:5432/convexo_db

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# Encryption (bank account AES-256-GCM — 64 hex chars)
ENCRYPTION_KEY=your-64-hex-char-key

# Network
NETWORK_MODE=testnet          # mainnet | testnet — controls primary chain

# RPC URLs
BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/...
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
UNICHAIN_MAINNET_RPC_URL=https://unichain-mainnet.g.alchemy.com/v2/...
UNICHAIN_SEPOLIA_RPC_URL=https://unichain-sepolia.g.alchemy.com/v2/...
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/...
ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/...

# Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@convexo.xyz

# Telegram
TELEGRAM_BOT_TOKEN=bot...
TELEGRAM_OPS_CHAT_ID=-100...     # operations alerts
TELEGRAM_ADMIN_CHAT_ID=-100...   # admin/KYC/funding alerts

# Veriff (KYC — Individual)
VERIFF_API_KEY=...
VERIFF_BASE_URL=https://stationapi.veriff.com
VERIFF_WEBHOOK_SECRET=...

# Sumsub (KYB — Business)
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET_KEY=...
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_WEBHOOK_SECRET=...

# n8n (Credit Score — Business)
N8N_WEBHOOK_URL=https://your-n8n.com/webhook/credit-score
N8N_WEBHOOK_SECRET=...

# Pinata (IPFS — public documents only)
PINATA_JWT=...
PINATA_API_KEY=...
PINATA_SECRET_KEY=...
PINATA_GATEWAY=your-gateway.mypinata.cloud

# Exchange rates (optional external feed)
EXCHANGE_RATE_API_KEY=...
RATES_CACHE_TTL_SECONDS=600

# Admin
ADMIN_WALLET_ADDRESSES=0x156d3C1648ef2f50A8de590a426360Cf6a89C6f8

# Swagger (token-gate in production; dev is open)
DOCS_SECRET=your-random-docs-secret-16-chars-min
```

### 3. Database Setup

```bash
# Run all pending migrations
npx prisma migrate deploy

# Regenerate Prisma client after schema changes
npx prisma generate

# (Optional) Browse data in Studio
npx prisma studio
```

### 4. Start Dev Server

```bash
npm run dev
# → API at http://localhost:3001
# → Swagger UI at http://localhost:3001/docs  (open in dev, token-gated in prod)
```

---

## Docker (Local Full Stack)

```bash
# Start PostgreSQL + Redis + backend together
docker-compose up -d

# Tail logs
docker-compose logs -f backend
```

`docker-compose.yml` is in the repo root — mounts `.env`, runs `prisma migrate deploy` before starting.

---

## Railway Production Deployment

### Linking

```bash
railway login
railway link          # link to the Convexo project
railway service link "convexo-api"   # target API service (not Postgres!)
railway status        # confirm correct service before any deploy
```

### Deploy

```bash
railway up --detach   # build + deploy current branch
railway logs          # tail live logs
```

`railway.toml` sets `preDeployCommand = "npx prisma migrate deploy"` — migrations run before the new container starts (zero-downtime for additive changes).

### Required Railway Variables

All env vars above plus the Railway-managed reference:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

---

## API Endpoints Reference

### Public (no auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/auth/nonce` | SIWE nonce |
| GET | `/rates` | All exchange rates |
| GET | `/rates/:pair` | Single pair (e.g. `USDC-COP`) |
| GET | `/pool/status` | Pool price + keeper status (primary chain) |
| GET | `/pool/status/:chainId` | Pool status for specific chain |
| GET | `/docs?token=<DOCS_SECRET>` | Swagger UI (token required in production) |

### Authenticated (requireAuth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/verify` | SIWE verification → JWT |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Blacklist token |
| GET | `/users/me` | Current user |
| GET/POST | `/onboarding/status`, `/onboarding/type`, `/onboarding/profile`, `/onboarding/complete` | Onboarding wizard |
| GET/PUT | `/profile` | User profile |
| GET/POST/PUT/DELETE | `/bank-accounts`, `/bank-accounts/:id`, `/bank-accounts/:id/default` | Bank accounts |
| GET/POST/PUT/DELETE | `/contacts`, `/contacts/:id` | Contacts |
| GET/POST/DELETE | `/documents`, `/documents/:id` | IPFS documents |
| GET/POST | `/otc/orders`, `/otc/orders/:id` | OTC orders |
| GET | `/vaults`, `/vaults/:address` | Tokenized bond vaults |
| GET/POST | `/reputation`, `/reputation/sync` | NFT tier cache |

### Individual only
| POST | `/verification/kyc/start`, `/verification/kyc/submit` | Veriff KYC |
| GET | `/verification/kyc/status` | |

### Business only
| POST | `/verification/kyb/start`, `/verification/kyb/submit` | Sumsub KYB |
| GET | `/verification/kyb/status` | |
| POST | `/verification/credit-score/submit` | Credit score (multipart) |
| GET | `/verification/credit-score/status` | |
| POST | `/funding/fiat-to-ecop` | Mint ECOP from fiat request |
| POST | `/funding/ecop-to-fiat` | Redeem ECOP to fiat request |
| GET/POST | `/funding/requests`, `/funding/requests/:id` | Vault funding requests |

### Webhooks (HMAC/Bearer — no JWT)
| POST | `/webhooks/veriff` | Veriff KYC result |
| POST | `/webhooks/sumsub` | Sumsub KYB result |
| POST | `/webhooks/n8n/credit-score` | n8n credit score result |

---

## Webhook Configuration

| Service | Backend Endpoint | Verification |
|---------|-----------------|--------------|
| Veriff | `POST /webhooks/veriff` | `X-Hmac-Signature` (HMAC-SHA256) |
| Sumsub | `POST /webhooks/sumsub` | `X-Payload-Digest` |
| n8n | `POST /webhooks/n8n/credit-score` | `Authorization: Bearer <N8N_WEBHOOK_SECRET>` |

> Raw body capture is enabled in `app.ts` via `addContentTypeParser` — required for HMAC verification.

---

## Checklist Before Production

### Auth & Secrets
- [ ] `JWT_SECRET` is cryptographically random (≥ 32 chars)
- [ ] `ENCRYPTION_KEY` is exactly 64 hex chars (AES-256-GCM)
- [ ] `DOCS_SECRET` set (≥ 16 chars) — Swagger protected in prod
- [ ] All webhook secrets match external service configs

### Database & Cache
- [ ] `DATABASE_URL` includes `?sslmode=require`
- [ ] Redis AUTH password set (`REDIS_URL=redis://:password@host:6379`)
- [ ] `npx prisma migrate deploy` run on production DB

### Network
- [ ] `NETWORK_MODE=mainnet` for production, `testnet` for staging
- [ ] All RPC URLs for target chains are set and healthy

### External Services
- [ ] Veriff webhook URL registered in Veriff dashboard
- [ ] Sumsub webhook URL registered in Sumsub dashboard
- [ ] n8n webhook URL and secret match
- [ ] Pinata JWT active, gateway configured
- [ ] Resend domain verified, `RESEND_FROM_EMAIL` set
- [ ] Telegram bot active, both chat IDs correct

### Security
- [ ] CORS is permissive (any origin) — access controlled by JWT only
- [ ] `ADMIN_WALLET_ADDRESSES` set to the correct deployer address
- [ ] No `.env` committed to git

### Smoke Tests
- [ ] `GET /health` → 200
- [ ] `GET /rates` → returns at least USDC-COP pair
- [ ] `GET /pool/status` → returns pool price data
- [ ] `GET /docs?token=<DOCS_SECRET>` → Swagger UI loads

# Convexo Backend — Deployment Guide

> Last updated: 2026-03-07

---

## Production Environment (Railway)

**Project:** `rare-smile`
**Service:** `convexo-api`
**URL:** `https://convexo-api-production.up.railway.app`
**Health check:** `GET /health`

### Infrastructure

| Service | Type | Connection |
|---------|------|-----------|
| `convexo-api` | Docker (Dockerfile) | Public domain above |
| `Postgres` | Railway PostgreSQL 16 | `postgres.railway.internal:5432` (private) |
| `Redis` | Railway Redis 7 | `redis.railway.internal:6379` (private) |

Database and Redis use Railway's **private networking** — no public exposure, no egress cost.

---

## Railway Config (`railway.toml`)

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
preDeployCommand = "npx prisma migrate deploy"   # runs before container starts; aborts deploy on failure
startCommand = "node dist/index.js"              # clean server start
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
overlapSeconds = 20                              # zero-downtime: old container stays up while new one starts
```

---

## Environment Variables

### Required (server won't start without these)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Railway Postgres plugin) |
| `REDIS_URL` | Redis connection string (auto-set by Railway Redis plugin) |
| `JWT_SECRET` | Min 32-char secret for signing JWTs |

### App Config

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `APP_URL` | `https://convexo-api-production.up.railway.app` |
| `FRONTEND_URL` | `https://protocol.convexo.xyz` (CORS whitelist) |
| `JWT_EXPIRES_IN` | `7d` |
| `JWT_REFRESH_EXPIRES_IN` | `30d` |

### Encryption

| Variable | Description |
|----------|-------------|
| `ENCRYPTION_KEY` | 64-char hex key — encrypts bank account numbers at rest. **Never rotate without migrating existing data.** |

### Pinata (IPFS)

| Variable | Description |
|----------|-------------|
| `PINATA_JWT` | Pinata scoped JWT |
| `PINATA_API_KEY` | Pinata API key |
| `PINATA_SECRET_KEY` | Pinata secret key |
| `PINATA_GATEWAY` | `lime-famous-condor-7.mypinata.cloud` |

### Blockchain RPC

| Variable | Value |
|----------|-------|
| `BASE_MAINNET_RPC_URL` | Infura/Alchemy Base mainnet endpoint |
| `BASE_SEPOLIA_RPC_URL` | Infura/Alchemy Base Sepolia endpoint |
| `UNICHAIN_MAINNET_RPC_URL` | `https://mainnet.unichain.org` |
| `UNICHAIN_SEPOLIA_RPC_URL` | `https://sepolia.unichain.org` |

### Notifications

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend transactional email key |
| `RESEND_FROM_EMAIL` | `financial@convexo.org` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for ops alerts |
| `TELEGRAM_OPS_CHAT_ID` | Ops chat ID |
| `TELEGRAM_ADMIN_CHAT_ID` | Admin chat ID |

### KYC / KYB / Credit Score (add when services are configured)

| Variable | Description |
|----------|-------------|
| `VERIFF_API_KEY` | Veriff API key (Individual KYC) |
| `VERIFF_BASE_URL` | `https://stationapi.veriff.com` |
| `VERIFF_WEBHOOK_SECRET` | HMAC secret for Veriff webhooks |
| `SUMSUB_APP_TOKEN` | Sumsub app token (Business KYB) |
| `SUMSUB_SECRET_KEY` | Sumsub secret key |
| `SUMSUB_BASE_URL` | `https://api.sumsub.com` |
| `SUMSUB_WEBHOOK_SECRET` | HMAC secret for Sumsub webhooks |
| `N8N_WEBHOOK_URL` | n8n credit score webhook URL |
| `N8N_WEBHOOK_SECRET` | Bearer token for n8n webhook auth |

### Exchange Rates

| Variable | Description |
|----------|-------------|
| `EXCHANGE_RATE_API_KEY` | External rates API key |
| `RATES_CACHE_TTL_SECONDS` | `600` (10 min Redis cache) |

### Admin

| Variable | Description |
|----------|-------------|
| `ADMIN_WALLET_ADDRESSES` | Comma-separated wallet addresses bootstrapped as SUPER_ADMIN |

---

## Webhook URLs (register in external service dashboards)

| Service | URL | Auth header |
|---------|-----|-------------|
| Veriff | `https://convexo-api-production.up.railway.app/webhooks/veriff` | `X-Hmac-Signature` |
| Sumsub | `https://convexo-api-production.up.railway.app/webhooks/sumsub` | `X-App-Token` |
| n8n | `https://convexo-api-production.up.railway.app/webhooks/n8n` | `X-Webhook-Secret` |

---

## Deploy a New Version

Railway auto-deploys on push if the repo is connected via GitHub (recommended).

For a manual deploy via CLI:

```bash
cd convexo-backend
railway up
```

Railway will:
1. Build the Docker image
2. Run `npx prisma migrate deploy` (preDeployCommand) — aborts if migrations fail
3. Start `node dist/index.js`
4. Health-check `GET /health` — must return 200 within 300s
5. Swap traffic (old container stays live for 20s overlap)

---

## Local Development

### Option A — Without Docker (fastest)

```bash
# Start only postgres + redis
docker-compose up postgres redis -d

# Install deps
npm install

# Run migrations
npm run db:migrate

# Start with hot reload
npm run dev
# → http://localhost:3001
# → Swagger: http://localhost:3001/docs
```

### Option B — Full Docker stack

```bash
docker-compose up -d

# Tail logs
docker-compose logs -f api
```

`start.sh` runs `prisma migrate deploy` then starts the server inside the container.

### Environment (local)

Copy `.env.example` → `.env` and fill in values. Minimum required:

```env
DATABASE_URL=postgresql://convexo:secret@localhost:5432/convexo_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=<min-32-chars>
```

---

## Database Commands

```bash
npm run db:migrate        # create + apply new migration (dev)
npm run db:migrate:prod   # apply pending migrations (prod-safe)
npm run db:generate       # regenerate Prisma client after schema change
npm run db:studio         # open Prisma Studio UI
npm run db:reset          # DESTRUCTIVE — wipe and re-seed (dev only)
```

---

## Pre-Production Checklist

### Security
- [ ] `JWT_SECRET` is cryptographically random (≥ 32 chars)
- [ ] `ENCRYPTION_KEY` is a real 64-char random hex (not a placeholder)
- [ ] `FRONTEND_URL` set to production frontend domain (CORS)
- [ ] `ADMIN_WALLET_ADDRESSES` is the correct wallet

### Infrastructure
- [ ] DATABASE_URL uses Railway internal host (`postgres.railway.internal`)
- [ ] REDIS_URL uses Railway internal host (`redis.railway.internal`)
- [ ] Health check passes: `curl https://convexo-api-production.up.railway.app/health`
- [ ] Migrations applied: all Prisma models exist in production DB

### Integrations (enable as each service is wired)
- [ ] Veriff webhook URL registered + secret matches `VERIFF_WEBHOOK_SECRET`
- [ ] Sumsub webhook URL registered + secret matches `SUMSUB_WEBHOOK_SECRET`
- [ ] n8n webhook URL configured + secret matches `N8N_WEBHOOK_SECRET`
- [ ] Pinata API keys active and gateway reachable
- [ ] Resend domain verified (`financial@convexo.org`)
- [ ] Telegram bot active + chat IDs correct

### Frontend Wiring
- [ ] Frontend `NEXT_PUBLIC_API_URL=https://convexo-api-production.up.railway.app`
- [ ] Backend `FRONTEND_URL=https://protocol.convexo.xyz`

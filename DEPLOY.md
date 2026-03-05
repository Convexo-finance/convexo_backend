# Convexo Backend — Deployment Guide

> Updated: 2026-03-04

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| PostgreSQL | 16 |
| Redis | 7 |
| Docker | 24+ (optional) |
| npm / pnpm | latest |

---

## Local Development

### 1. Install Dependencies

```bash
cd convexo-backend
npm install
```

### 2. Environment Variables

Create `.env`:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/convexo"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_REFRESH_SECRET="your-refresh-secret-min-32-chars"

# Email (Resend)
RESEND_API_KEY="re_..."

# Telegram
TELEGRAM_BOT_TOKEN="bot..."
TELEGRAM_CHAT_ID="-100..."

# Veriff (KYC — Individual)
VERIFF_API_KEY="..."
VERIFF_BASE_URL="https://stationapi.veriff.com"
VERIFF_WEBHOOK_SECRET="..."

# Sumsub (KYB — Business)
SUMSUB_APP_TOKEN="..."
SUMSUB_SECRET_KEY="..."
SUMSUB_BASE_URL="https://api.sumsub.com"

# n8n (Credit Score — Business)
N8N_WEBHOOK_URL="https://your-n8n.com/webhook/credit-score"
N8N_WEBHOOK_SECRET="..."

# Pinata (IPFS)
PINATA_API_KEY="..."
PINATA_SECRET_API_KEY="..."

# Admin
ADMIN_WALLET_ADDRESS="0x156d3C1648ef2f50A8de590a426360Cf6a89C6f8"

# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
```

### 3. Database Setup

```bash
# Run migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# (Optional) Open Prisma Studio
npm run db:studio
```

### 4. Start Dev Server

```bash
npm run dev
# → Server at http://localhost:3001
# → Swagger UI at http://localhost:3001/docs
```

---

## Docker (Local Full Stack)

### docker-compose.yml

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: convexo
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: .
    ports:
      - "3001:3001"
    env_file: .env
    depends_on:
      - postgres
      - redis
    command: sh -c "npm run db:migrate:prod && npm run start"

volumes:
  pgdata:
```

```bash
# Start everything
docker-compose up -d

# Check logs
docker-compose logs -f backend
```

---

## Onboarding API Endpoints

The backend serves the following onboarding endpoints consumed by the frontend wizard:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/onboarding/status` | Returns `{ step, accountType, isComplete, nextAction }` |
| `POST` | `/onboarding/type` | Sets account type: `{ accountType: "INDIVIDUAL" \| "BUSINESS" }` |
| `POST` | `/onboarding/profile` | Saves profile (Individual or Business fields) |
| `GET` | `/profile` | Returns full profile (type-specific fields) |
| `PUT` | `/profile` | Updates editable contact fields |

### Onboarding Step State Machine

```
NOT_STARTED → TYPE_SELECTED → PROFILE_COMPLETE → HUMANITY_VERIFIED
→ LP_VERIFIED → CREDIT_SCORE_SUBMITTED → CREDIT_SCORE_VERIFIED → COMPLETE
```

---

## Webhook Configuration

External services must be configured to call these URLs:

| Service | Webhook URL | Header | Purpose |
|---------|-------------|--------|---------|
| Veriff | `https://api.convexo.io/webhooks/veriff/decision` | `X-Hmac-Signature` | KYC results (Individual) |
| Sumsub | `https://api.convexo.io/webhooks/sumsub/event` | `X-App-Token` | KYB results (Business) |
| n8n | `https://api.convexo.io/webhooks/n8n/credit-score` | `X-Webhook-Secret` | Credit score results (Business) |

> HMAC secrets must match between the external service config and the backend `.env`.

---

## Production Deployment (Railway / Render / VPS)

1. Set all environment variables from `.env` above
2. Set `NODE_ENV=production`
3. Build command: `npm run build`
4. Start command: `npm run db:migrate:prod && npm start`
5. Health check: `GET /health` (returns 200)

### Database (Production)

```bash
DATABASE_URL="postgresql://..." npm run db:migrate:prod
```

---

## Health Checks & Monitoring

```bash
# Backend health
curl http://localhost:3001/health

# Swagger API docs (dev only)
open http://localhost:3001/docs

# Prisma Studio (dev only)
npm run db:studio
```

---

## Checklist Before Production

### Secrets & Auth
- [ ] `JWT_SECRET` is cryptographically random (≥ 32 chars)
- [ ] `JWT_REFRESH_SECRET` is different from JWT_SECRET
- [ ] All `.env` secrets set (no defaults)

### Database & Cache
- [ ] Database SSL enabled (`?sslmode=require` in `DATABASE_URL`)
- [ ] Redis AUTH password set
- [ ] DB migrations run on production

### External Services
- [ ] Veriff webhook secret configured & URL registered
- [ ] Sumsub webhook secret configured & URL registered
- [ ] n8n webhook secret configured & URL registered
- [ ] Pinata API keys active
- [ ] Resend email domain verified
- [ ] Telegram bot active

### Security
- [ ] CORS restricted to production frontend domain
- [ ] Admin wallet address set correctly
- [ ] Smart contract addresses verified on target chain

### Onboarding
- [ ] `GET /onboarding/status` returns correct step for new users (NOT_STARTED)
- [ ] `POST /onboarding/type` accepts INDIVIDUAL and BUSINESS
- [ ] `POST /onboarding/profile` validates and stores per-type fields
- [ ] `GET /profile` returns type-specific identity data

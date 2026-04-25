# Changelog

All notable changes to convexo-backend are documented here.
Format: `## [vX.Y] — YYYY-MM-DD` followed by bullet points grouped by Added / Changed / Fixed.

---

## [v3.24] — 2026-04-25

### Added
- `POST /funding/fiat-to-ecop` — mint ECOP from fiat request (any authenticated user); stores as `FundingRequest` row; fires Telegram admin alert
- `POST /funding/ecop-to-fiat` — redeem ECOP to fiat request (any authenticated user); stores as `FundingRequest` row; fires Telegram admin alert
- `fiatToEcopSchema` / `ecopToFiatSchema` (Zod) + inferred types in `funding.schema.ts`
- `createFiatToEcop` / `createEcopToFiat` service functions in `funding.service.ts`
- `fiatToEcop` / `ecopToFiat` controller handlers in `funding.controller.ts`

### Fixed
- `GET /admin/users/:id` — response now wraps into `{ user, profile, verifications, reputation }` envelope; previously returned the flat Prisma row causing the admin user detail panel to display nothing

---

## [v3.23] — 2026-04-25

### Added
- `DOCS_SECRET` env var — generates a token-protected `/docs` UI in production
- `GET /docs?token=<secret>` (or `x-docs-token` header) — Swagger UI now accessible in all environments; 401 without valid token in production
- `DOCS_SECRET` documented in `.env.example`

### Changed
- `src/plugins/swagger.ts` — removed `NODE_ENV !== 'production'` gate; replaced with `onRequest` hook that validates `DOCS_SECRET` in production only; dev remains open

---

## [v3.22] — 2026-04-22

### Added
- `SubmissionDocument` model: stores binary file content (`BYTEA`) in PostgreSQL — no IPFS
- `KybSubmission` and `KycSubmission` models with `status`, `reviewNote`, `reviewedAt`, `reviewedBy`
- `POST /verification/kyb/submit` — multipart endpoint; accepts form fields + up to 6 document files; stores to DB
- `POST /verification/kyc/submit` — multipart endpoint; accepts 2–3 identity documents; stores to DB
- Admin KYB/KYC review endpoints: list, get, patch status (approve/reject)
- `GET /admin/submissions/documents/:docId` — streams document content with correct MIME headers
- Admin module: `listKybSubmissions`, `getKybSubmission`, `reviewKybSubmission` (syncs Verification record)
- Admin module: `listKycSubmissions`, `getKycSubmission`, `reviewKycSubmission`
- Telegram admin alert when new KYB/KYC submission arrives (non-blocking)

### Changed
- `KybSubmission` / `KycSubmission`: removed Pinata CID fields; documents now live in `SubmissionDocument`

---

## [v3.21] — 2026-04-22

### Added
- `KybSubmission` and `KycSubmission` Prisma models (initial, with CID placeholders — superseded by v3.22)

---

## [v3.20] — 2026-04-22

### Added
- `BankAccount`: 9 new fields (`bankCountry`, `documentType`, `documentNumber`, `bankAddress`, `bankCity`, `bankState`, `swiftCode`, `routingNumber`, `iban`)
- `OtcOrder`: 13 new fields for fiat-OTC format (`orderId`, `orderType` enum, `digitalAsset`, `fiatCurrency`, `assetAmount`, `estimatedFiat`, `rate`, `walletAddress`, `frontendTimestamp`, sell-side bank info)
- `CONFIRMED` status to `OtcOrderStatus` enum
- `PATCH /otc/orders/:id/status` — user-facing status update endpoint (VERIFIER role required)
- Dual lookup in OTC service: supports both CUID `id` and `OTC-{timestamp}` `orderId`

### Changed
- `BankAccount.holderName` — made required (NOT NULL with backfill)
- OTC legacy fields (`tokenIn`, `tokenOut`, `amountIn`, `amountOut`, `network`) — made nullable for backward compatibility

---

## [v3.19] — prior

### Fixed
- Chain-aware contract addresses; ETH Sepolia as primary testnet

---

## [v3.18] — prior

### Added
- Pool keeper background task (Uniswap V4 hook rebalance, 5-min interval)
- Vault module
- On-chain rate sync
- Security fixes

---

## [v3.17 and earlier]

See git log for full history (`git log --oneline`).

---

## Claude Code Workspace — 2026-04-22

### Added
- `CLAUDE.md` — project architecture, patterns, and AI collaboration rules
- `CLAUDE.local.md` — local dev paths and Railway CLI notes (gitignored)
- `.claude/settings.json` — Claude Code permission profile
- `.claude/rules/` — coding style, testing, migrations, security guidelines
- `.claude/commands/init-project.md` — reusable scaffold prompt
- `.claude/skills/` — deploy, add-module, db-migration, fix-error, add-webhook
- `.claude/hooks/` — pre-deploy check, post-code-change lint, changelog reminder
- `mcp.json` — MCP server configuration (Railway, GitHub, Context7)

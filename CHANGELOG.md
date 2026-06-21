# Changelog

All notable changes to convexo-backend are documented here.
Format: `## [vX.Y] — YYYY-MM-DD` followed by bullet points grouped by Added / Changed / Fixed.

---

## [v3.29] — 2026-06-19

### Fixed — auth audit critical findings (see AUDIT-AUTH-2026-06-19.md)
- **🔴 Logout no longer locks the user out.** `blacklistToken` previously keyed by `userId` with a 30-day TTL; `requireAuth` checked the same key but login/refresh never cleared it, so a user who logged out and back in had every authenticated request rejected as "revoked" for 30 days. Tokens now carry a per-token `jti`; logout blacklists only that `jti` (TTL = the token's remaining lifetime); `requireAuth` checks by `jti`. Deploying this also frees anyone currently stuck (the old userId keys are no longer consulted). — `auth.service.ts`, `auth.controller.ts`, `requireAuth.ts`, `types.ts`
- **🔴 SIWE message now validated.** `verifySiweSignature` previously checked only the signature + nonce — `domain`, `address`, `chainId`, and expiration in the signed message were ignored, so a signature gathered on any origin/chain passed. Now validates: message `address` == authenticating address, `domain` ∈ `SIWE_ALLOWED_DOMAINS` allowlist (anti-phishing; skipped when unset for dev), `expirationTime`/`notBefore` bounds, then signature, then single-use nonce. The recorded `chainId` now comes from the signed message, not the client-supplied body. New env `SIWE_ALLOWED_DOMAINS`.
- **🔴 Refresh tokens can no longer authorize protected routes.** `requireAuth` now rejects any token with `tokenType: 'refresh'` (previously a 30-day refresh token worked as a bearer access token on every endpoint).

### Notes
- Build clean: `npx tsc --noEmit` → 0 errors
- Set `SIWE_ALLOWED_DOMAINS=protocol.convexo.xyz,admin.convexo.xyz` on Railway prod (leave empty locally)
- 🟡/🟢 audit items (signOut ordering, refresh-timeout, admin wallet-disconnect on logout, refresh rotation, dead code) tracked in AUDIT-AUTH-2026-06-19.md for a follow-up pass

## [v3.28] — 2026-06-19

### Added — Credit Score P4 (backend extraction + preliminary scoring)
- `src/modules/verification/credit-score-extraction.service.ts` — `uploadAndExtractCreditDocument` (sync v1: store encrypted PDF → Claude extract → merge line items → recompute preliminary score), `getMyCreditDraft`, `patchCreditDraft` (editable line-item allowlist + live recompute), `submitCreditDraft` (requires revenue + computed score → promotes draft → PENDING). Hybrid scoring: `computeIndicators`/`indicatorsToScore` produce `computedScore`/`computedTier`; admin still overrides final `score`/`rating`
- `src/modules/verification/credit-score-extraction.routes.ts` — `POST /verification/credit-score/upload` (multipart, `docType` ∈ balance_sheet/income_statement/cash_flow + optional `period`), `GET /verification/credit-score/draft`, `PATCH /verification/credit-score/draft/:id`, `POST /verification/credit-score/draft/:id/submit`. Gated by `env.KYB_CUSTOM_FLOW` (one flag for the whole custom flow), `requireAuth + requireBusiness`
- `prisma/schema.prisma` — `CreditScoreRequest` gains `extractedLineItems`/`extractedIndicators` (Json), `computedScore` (Int), `computedTier`/`extractionVersion` (String), and a `documents SubmissionDocument[]` relation. `SubmissionDocument` gains nullable `creditScoreRequestId` FK. `CreditScoreStatus` enum gains `DRAFT`/`EXTRACTING`/`READY_FOR_REVIEW`/`SCORE_COMPUTED`/`MINTED`
- `prisma/migrations/20260619000000_credit_score_extraction/migration.sql` — additive, idempotent (`ADD VALUE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), zero-downtime. Railway auto-applies via `preDeployCommand`
- `src/shared/document-store.ts` — `storeDocument` now accepts `creditScoreRequestId` so credit-score PDFs flow through the same `DocumentExtraction` pipeline + admin download endpoint as KYB/KYC

### Changed — admin endpoints surface extraction data (P6 support)
- `src/modules/admin/admin.service.ts` — `getKybSubmission` now includes each document's latest `DocumentExtraction` (extractedData + confidence) for the admin extracted-vs-corrected diff; credit-score list now includes `documents` + their extractions. The new `CreditScoreRequest` scalar columns (`computedScore`/`computedTier`/`extractedIndicators`/`extractedLineItems`) already flow through (no `select` narrowing them)

### Fixed
- `src/app.ts` — **`kybExtractionRoutes` was imported in v3.27.1 but never registered** (the KYB upload/draft/submit endpoints 404'd). Now both `kybExtractionRoutes` and `creditScoreExtractionRoutes` are registered after `verificationRoutes`

### Added — P7 cutover guard (legacy retirement)
- `src/shared/errors.ts` — new `GoneError` (410)
- `src/modules/verification/verification.routes.ts` — legacy `POST /verification/kyb/submit` and `POST /verification/credit-score/submit` now 410 **only when `KYB_CUSTOM_FLOW=true`** (preHandler `retiredWhenCustomFlowOn`), pointing callers at the new `/upload` endpoints. Atomic cutover: while the flag is off, legacy keeps working — no window where both flows are disabled
- `src/modules/verification/sumsub.service.ts` — marked `@deprecated` (removal deferred to one stable release after cutover; see plan §7.1)

### Notes
- Build clean: `npx tsc --noEmit` → 0 errors; `npx prisma validate` → valid
- `KYB_CUSTOM_FLOW=false` in Railway prod — all custom-flow routes return 403 until flipped; legacy submit endpoints stay live until then
- **Go-live = manual:** set `ANTHROPIC_API_KEY` on Railway, then flip `KYB_CUSTOM_FLOW=true` (see plan §7.1 runbook)
- Credit-score documents reuse the existing `/admin/submissions/documents/:docId/download` path (no admin change needed for download)
- BullMQ async worker still deferred — sync extraction is fine at testnet volume

## [v3.27.1] — 2026-05-24

### Added — KYB + Credit Score P2 (backend wiring)
- `prisma/schema.prisma` — KybSubmission gains nullable columns: `controllerFirstName`, `controllerLastName`, `controllerEmail`, `controllerPhone`, `controllerRelationship`, `controllerWallet`, `governance` (Json), `extractedData` (Json), `extractionVersion`. New `DocumentExtraction` model + `ExtractionStatus` enum (PENDING / EXTRACTING / COMPLETED / FAILED) with FK to `SubmissionDocument`
- `prisma/migrations/20260523120000_kyb_extraction/migration.sql` — additive migration, no backfill. Railway auto-applies via `preDeployCommand`
- `src/modules/verification/kyb-extraction.service.ts` — `uploadAndExtractKybDocument` (sync v1: store encrypted PDF → run Claude → save extraction → return data + confidence), `getMyKybDraft`, `patchKybDraft` (with editable-fields allowlist), `submitKybDraft` (validates required fields → promotes DRAFT/READY_FOR_REVIEW → PENDING). Discriminated dispatch on docType keeps `extractFromPdf<T>` types narrow
- `src/modules/verification/kyb-extraction.routes.ts` — `POST /verification/kyb/upload` (multipart), `GET /verification/kyb/draft`, `PATCH /verification/kyb/draft/:id`, `POST /verification/kyb/draft/:id/submit`. All gated by `env.KYB_CUSTOM_FLOW` (returns 403 when off). All require `requireAuth + requireBusiness`
- `src/app.ts` — register `kybExtractionRoutes` (always registered; feature flag enforced per-handler so flipping the env var in Railway needs no redeploy)
- New KYB string statuses: `DRAFT`, `EXTRACTING`, `READY_FOR_REVIEW`, `MINTED` (KybSubmission.status is String — no enum migration needed)

### Notes
- Build clean: `npx tsc --noEmit` → 0 errors
- `KYB_CUSTOM_FLOW=false` in Railway prod — routes return 403 until we flip it (P3 frontend will land first)
- Migration is additive (nullable columns + new table) — zero-downtime
- The plan's BullMQ worker for async extraction is deferred — sync is fine at testnet volume; swap later

---

## [v3.27] — 2026-05-23

### Added — KYB + Credit Score P1 (storage + Claude extraction core)
- `src/shared/encryption.ts` — extracted shared AES-256-GCM helpers; adds Buffer-native `encryptBuffer` / `decryptBuffer` with packed wire format (`iv(12) || authTag(16) || ciphertext`) for binary blobs
- `src/shared/document-store.ts` — `storeDocument` / `readDocumentBuffer` / `deleteDocument`; wraps `SubmissionDocument` with app-layer AES-256-GCM, SHA-256 content hash, 20MB limit, MIME allowlist (pdf/jpeg/png). v2 path swaps Postgres `content Bytes` → R2 behind same interface (see KYB-CREDIT-SCORE-PLAN.md §4.1)
- `src/shared/anthropic.ts` — lazy Anthropic SDK singleton; defaults model to `claude-sonnet-4-6`
- `src/shared/extraction.service.ts` — generic `extractFromPdf<T>` using Claude PDF support (base64 document block), JSON parse + Zod validation, one retry with failure-context appended to system prompt, per-field confidence map normalized to 0-1, returns prompt/completion tokens for audit
- `src/shared/credit-score-indicators.ts` — pure `computeIndicators` + `indicatorsToScore` over `FinancialLineItems`, 7 weighted indicators (current ratio, debt/equity, gross margin, EBITDA margin, interest coverage, operating CF margin, revenue growth), weight redistribution when revenue growth is missing, tier mapping EXCELLENT/GOOD/FAIR/POOR
- `src/modules/verification/extraction-schemas/kyb.schema.ts` — Zod schemas for incorporation cert / articles / shareholders extractions (mirror Prisma KybSubmission columns)
- `src/modules/verification/extraction-schemas/credit-score.schema.ts` — Zod schemas for balance sheet / income statement / cash flow (mirror FinancialLineItems)
- `src/modules/verification/prompts/*.ts` — 6 Spanish-language system prompts (kyb-incorporation, kyb-articles, kyb-shareholders, credit-balance-sheet, credit-income-statement, credit-cash-flow), tuned for Colombian NIIF/CC document templates
- `src/config/env.ts` — adds `ANTHROPIC_API_KEY` (optional), `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`), `KYB_CUSTOM_FLOW` boolean gate
- Dependency: `@anthropic-ai/sdk` added

### Notes
- Build clean: `npx tsc --noEmit` returns 0 errors
- No routes wired yet — P2 adds the new `kyb-extraction.service.ts` + `kyb-extraction.routes.ts` and dual-writes alongside the existing `kyb-submit.service.ts` while `KYB_CUSTOM_FLOW=false` (off in prod until frontend is ready)
- Storage: v1 keeps PDF blobs in Postgres `SubmissionDocument.content Bytes` (per KYB-CREDIT-SCORE-PLAN.md §10 revised 2026-05-23). Cloudflare R2 swap deferred to v2.

---

## [v3.26] — 2026-05-14

### Fixed
- `pool.service.ts`: Phase 1 hook graceful fallback — `getPoolPriceStatus`, `lastRebalanceAt`, `rebalanceCooldown` calls wrapped in try/catch; token balance reads separated (always succeed); returns 200 with `poolPrice: 'N/A — Phase 1 hook'` instead of 500 when using PassportGatedHook on ETH Sepolia
- Deployed to Railway — `GET /pool/status` confirmed returning 200 for chainId 11155111

### Changed
- `pool.keeper.ts` JSDoc comment corrected: "defaults to 1301 — Unichain Sepolia" → "defaults to 11155111 — ETH Sepolia"

### Audit
- Cross-repo contract audit completed (see `AUDIT.md` at project root)
- MINTER_ROLE confirmed granted on LP_INDIVIDUALS, LP_BUSINESS, ECREDITSCORING on ETH Sepolia (all return `true` for `hasRole(MINTER_ROLE, 0x156d3C16...)`)
- `ManualPriceAggregator` (v3.21, ETH Sepolia `0xBebDf2e6AdF4ca1e26531A778cdf669Da989EB79`) address wired in `rates.service.ts` via `MANUAL_PRICE_AGGREGATOR_ADDRESS` env var

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

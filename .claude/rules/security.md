# Security Rules

## Authentication
- All protected endpoints must have `requireAuth` as the first preHandler.
- JWT tokens are validated via `fastify-jwt` plugin. Never decode manually.
- Blacklisted JWTs are stored in Redis (`jwt:blacklist:{jti}`) — check this in requireAuth.
- SIWE nonces expire after 5 minutes (stored in Redis `siwe:nonce:{nonce}`).

## Sensitive data
- Bank account numbers are AES-256-GCM encrypted before storage. Never store plaintext.
- KYB/KYC identity documents are stored as BYTEA in PostgreSQL — never on public IPFS or S3 without encryption.
- Private keys never touch the backend. Signing happens on the client.
- Never log wallet addresses, account numbers, or document contents.

## Input validation
- Every endpoint validates input through Zod before the service layer sees it.
- File uploads: validate `mimetype` against an allowlist (`image/jpeg`, `image/png`, `application/pdf`).
- File size: reject uploads over the configured limit in the multipart plugin.
- Never pass raw `request.query` or `request.body` to Prisma.

## Authorization
- Role hierarchy: `VIEWER < VERIFIER < SUPER_ADMIN`.
- `requireAdmin('VERIFIER')` blocks VIEWER but allows VERIFIER and SUPER_ADMIN.
- Users can only access their own resources (verify `userId === request.user.sub` in service).
- Admin endpoints are under `/admin/*` — never mix user and admin logic in the same handler.

## Rate limiting
- `fastify-rate-limit` is applied globally. Sensitive endpoints (login, document upload) should have stricter per-route limits.

## Secrets
- All secrets come from environment variables validated by Zod (`src/config/env.ts`).
- Never hardcode secrets. Never commit `.env`.
- Railway environment variables are the source of truth for production secrets.

## Logging
- Use `logger.info / warn / error` — never `console.log`.
- Do not log request bodies that may contain sensitive data.
- Log admin actions (who did what, to which resource, at what time).

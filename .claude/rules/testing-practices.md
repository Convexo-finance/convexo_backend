# Testing Practices

## Current state
This project does not yet have a test suite. When tests are added:

## What to test
- Service functions (business logic) with a real test database — do NOT mock Prisma.
- Controllers via Fastify `inject()` — tests the full request/response cycle including Zod validation.
- Middleware (requireAuth, requireAdmin) as unit tests with mock request objects.

## What not to test
- Prisma generated types — they're already tested by Prisma.
- Simple CRUD service functions that are just Prisma wrappers with no logic.
- Notification functions — test that they're called, not their internals.

## Database in tests
Use a separate `DATABASE_URL` pointing to a test Postgres instance.
Run `npx prisma migrate deploy` before the test suite.
Truncate tables between tests — do not use mocks.

## Test file location
`src/modules/<name>/<name>.service.test.ts` — co-located with the module.

## Environment
Set `NODE_ENV=test` to suppress logger output and skip Telegram/email calls.

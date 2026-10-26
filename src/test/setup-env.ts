/**
 * Loaded before every test file (`npm test`). `src/config/env.ts` validates on
 * import, so defaults must exist before any app module loads.
 *
 * Integration tests need a disposable Postgres (+ Redis) and only run when
 * TEST_DATABASE_URL is set — they TRUNCATE tables. Never point it at a real DB.
 */
process.env.NODE_ENV = 'test'
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.DIRECT_URL   = process.env.TEST_DATABASE_URL
}
process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused'
process.env.REDIS_URL    = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379'
process.env.JWT_SECRET   ??= 'test-secret-'.padEnd(48, 'x')
process.env.KYB_CUSTOM_FLOW = 'true'
process.env.SUPABASE_STORAGE_BUCKET = 'documents'

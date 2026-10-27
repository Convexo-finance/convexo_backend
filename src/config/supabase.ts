import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'
import { BadRequestError } from '../shared/errors'

/**
 * Server-side Supabase client — **service role**, used for Storage only.
 *
 * The service-role key bypasses RLS, so it never leaves the backend. The browser
 * never gets a Supabase key: it receives a single-object signed upload URL from
 * `POST /verification/<flow>/upload-url` and PUTs the file straight to Storage
 * (Vercel caps request bodies at 4.5 MB, so files must not transit the API).
 *
 * Postgres access stays on Prisma; this client is not used for the Data API.
 */

/** The subset of the Storage bucket API the backend uses (lets tests inject a fake). */
export interface DocumentBucket {
  createSignedUploadUrl(
    path: string,
    options?: { upsert: boolean },
  ): Promise<{ data: { signedUrl: string; token: string; path: string } | null; error: Error | null }>
  download(path: string): PromiseLike<{ data: Blob | null; error: Error | null }>
  createSignedUrl(
    path: string,
    expiresIn: number,
    options?: { download?: string | boolean },
  ): Promise<{ data: { signedUrl: string } | null; error: Error | null }>
  remove(paths: string[]): Promise<{ data: unknown; error: Error | null }>
}

let client: SupabaseClient | null = null
let bucketOverride: DocumentBucket | null = null

function getClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new BadRequestError('Document storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).')
  }
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  return client
}

/** Private bucket holding KYB / KYC / credit-score documents. */
export function documentsBucket(): DocumentBucket {
  if (bucketOverride) return bucketOverride
  return getClient().storage.from(env.SUPABASE_STORAGE_BUCKET)
}

/** Test seam — swap the bucket for an in-memory fake. Pass `null` to reset. */
export function setDocumentsBucketForTests(bucket: DocumentBucket | null): void {
  bucketOverride = bucket
}

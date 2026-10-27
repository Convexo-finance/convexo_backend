-- ═══════════════════════════════════════════════════════════════════════════════
-- Supabase Storage — private `documents` bucket for KYB / KYC / credit-score files
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Apply ONCE per Supabase project (SQL editor or `psql "$DIRECT_URL" -f supabase/storage.sql`).
-- Idempotent: safe to re-run; it converges the bucket settings and policy.
--
-- WHY THIS IS NOT A PRISMA MIGRATION
--   `storage.buckets` / `storage.objects` belong to Supabase (owner
--   `supabase_storage_admin`), not to our Prisma schema. They do not exist on the
--   local docker-compose Postgres or on Prisma's shadow database, so putting this in
--   prisma/migrations would break `prisma migrate dev` and local `migrate deploy`.
--   Prisma also cannot diff these objects. Keep it here, apply it as an infra step.
--
-- ACCESS MODEL
--   * Bucket is private (`public = false`): no unauthenticated object URLs exist.
--   * anon / authenticated get NOTHING on this bucket (restrictive deny policy below).
--     We never use Supabase Auth; the browser holds no Supabase key at all.
--   * The backend uses the service-role key, which bypasses RLS, to:
--       - mint single-object signed UPLOAD urls  (createSignedUploadUrl, valid 2 h, no upsert)
--       - download for verification + Claude extraction
--       - mint short-lived signed DOWNLOAD urls for admins (60 s)
--   * Signed upload/download URLs carry their own storage-signed token, so they work
--     without any client-role policy.
--
-- DEFENCE IN DEPTH
--   The bucket also enforces the 20 MB limit and MIME allowlist itself, so a client
--   that ignores the declared size/type is rejected by Storage at upload time — the
--   API re-checks size, content-type and magic bytes on confirm.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  20971520,                                            -- 20 MB, matches MAX_DOC_BYTES in src/shared/document-store.ts
  array['application/pdf', 'image/jpeg', 'image/png']  -- matches ALLOWED_MIME in src/shared/document-store.ts
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS on storage.objects is enabled by Supabase by default. Assert it rather than
-- ALTER it (we don't own the table).
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'RLS is disabled on storage.objects — refusing to continue';
  end if;
end $$;

-- RESTRICTIVE policy: AND-ed with every permissive policy, so even if someone later
-- adds a broad permissive policy (e.g. "authenticated can read all objects"), client
-- roles still cannot touch this bucket. service_role bypasses RLS and is unaffected.
drop policy if exists "documents: deny client roles" on storage.objects;
create policy "documents: deny client roles"
  on storage.objects
  as restrictive
  for all
  to anon, authenticated
  using      (bucket_id <> 'documents')
  with check (bucket_id <> 'documents');

commit;

-- Verify (expect: public=false, 20971520, {application/pdf,image/jpeg,image/png}; one policy row):
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'documents';
--   select policyname, permissive, roles, cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects' and policyname like 'documents:%';

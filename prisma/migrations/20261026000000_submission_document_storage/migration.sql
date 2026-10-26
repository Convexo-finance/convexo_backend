-- Move submission document bytes from Postgres (`content BYTEA`, app-encrypted) to a
-- private Supabase Storage bucket. The row keeps metadata + the object key.
--
-- WHY: the API runs on Vercel, where request bodies are capped at 4.5 MB, so the
-- browser now uploads straight to Storage with a signed upload URL issued by the API.
--
-- Pre-launch: there are no documents to migrate, so `content` is dropped outright
-- (no dual-write). Safety net: `storagePath` is added NOT NULL without a default, so
-- if this ever runs against a table that DOES have rows, the statement fails and the
-- whole ALTER (including the DROP) rolls back instead of silently losing files.
--
-- The bucket itself and its storage RLS are NOT here — `storage.*` is owned by
-- Supabase, not Prisma, and does not exist on a plain local Postgres. See
-- supabase/storage.sql (applied once by the operator).

CREATE TYPE "DocumentUploadStatus" AS ENUM ('PENDING', 'UPLOADED');

ALTER TABLE "SubmissionDocument"
  DROP COLUMN "content",
  ADD COLUMN "storagePath" TEXT NOT NULL,
  ADD COLUMN "status"      "DocumentUploadStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "sha256"      TEXT,
  ADD COLUMN "uploadedAt"  TIMESTAMP(3);

CREATE UNIQUE INDEX "SubmissionDocument_storagePath_key" ON "SubmissionDocument"("storagePath");
CREATE INDEX "SubmissionDocument_userId_idx" ON "SubmissionDocument"("userId");

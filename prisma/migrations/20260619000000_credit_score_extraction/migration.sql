-- Credit Score custom doc-upload flow (P4 — v3.28)
-- Additive only: new enum values, new nullable columns, new FK on SubmissionDocument.
-- Zero-downtime — no backfill required. See KYB-CREDIT-SCORE-PLAN.md §4.5.

-- ── New draft-lifecycle statuses (ADD VALUE is idempotent via IF NOT EXISTS) ──
ALTER TYPE "CreditScoreStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "CreditScoreStatus" ADD VALUE IF NOT EXISTS 'EXTRACTING';
ALTER TYPE "CreditScoreStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW';
ALTER TYPE "CreditScoreStatus" ADD VALUE IF NOT EXISTS 'SCORE_COMPUTED';
ALTER TYPE "CreditScoreStatus" ADD VALUE IF NOT EXISTS 'MINTED';

-- ── Computed preliminary score + extracted line items on the request ──────────
ALTER TABLE "CreditScoreRequest"
  ADD COLUMN IF NOT EXISTS "extractedLineItems"  JSONB,
  ADD COLUMN IF NOT EXISTS "extractedIndicators" JSONB,
  ADD COLUMN IF NOT EXISTS "computedScore"       INTEGER,
  ADD COLUMN IF NOT EXISTS "computedTier"        TEXT,
  ADD COLUMN IF NOT EXISTS "extractionVersion"   TEXT;

-- ── Attach documents to a credit-score request (mirrors KYB/KYC linkage) ──────
ALTER TABLE "SubmissionDocument"
  ADD COLUMN IF NOT EXISTS "creditScoreRequestId" TEXT;

ALTER TABLE "SubmissionDocument"
  ADD CONSTRAINT "SubmissionDocument_creditScoreRequestId_fkey"
  FOREIGN KEY ("creditScoreRequestId") REFERENCES "CreditScoreRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

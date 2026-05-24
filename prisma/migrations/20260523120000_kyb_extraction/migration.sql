-- KYB + Credit Score P2 — custom KYB flow with Claude extraction
-- See KYB-CREDIT-SCORE-PLAN.md §4.5

-- ─── New columns on KybSubmission (all nullable, no backfill needed) ─────────
ALTER TABLE "KybSubmission"
  ADD COLUMN "controllerFirstName"    TEXT,
  ADD COLUMN "controllerLastName"     TEXT,
  ADD COLUMN "controllerEmail"        TEXT,
  ADD COLUMN "controllerPhone"        TEXT,
  ADD COLUMN "controllerRelationship" TEXT,
  ADD COLUMN "controllerWallet"       TEXT,
  ADD COLUMN "governance"             JSONB,
  ADD COLUMN "extractedData"          JSONB,
  ADD COLUMN "extractionVersion"      TEXT;

-- ─── New enum: ExtractionStatus ──────────────────────────────────────────────
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'EXTRACTING', 'COMPLETED', 'FAILED');

-- ─── New model: DocumentExtraction ───────────────────────────────────────────
CREATE TABLE "DocumentExtraction" (
    "id"                   TEXT NOT NULL,
    "documentId"           TEXT NOT NULL,
    "docType"              TEXT NOT NULL,
    "status"               "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "modelName"            TEXT,
    "systemPromptVersion"  TEXT,
    "rawResponse"          TEXT,
    "extractedData"        JSONB,
    "confidence"           JSONB,
    "promptTokens"         INTEGER,
    "completionTokens"     INTEGER,
    "errorMessage"         TEXT,
    "startedAt"            TIMESTAMP(3),
    "completedAt"          TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentExtraction_documentId_idx" ON "DocumentExtraction"("documentId");
CREATE INDEX "DocumentExtraction_status_idx"     ON "DocumentExtraction"("status");

ALTER TABLE "DocumentExtraction"
  ADD CONSTRAINT "DocumentExtraction_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "SubmissionDocument"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── KybSubmission: drop CID columns, add review fields ──────────────────────

ALTER TABLE "KybSubmission" DROP COLUMN "incorporationCertificateCid";
ALTER TABLE "KybSubmission" DROP COLUMN "taxDocumentCid";
ALTER TABLE "KybSubmission" DROP COLUMN "proofOfAddressCid";
ALTER TABLE "KybSubmission" DROP COLUMN "representativeIdCid";
ALTER TABLE "KybSubmission" DROP COLUMN "shareholdersCertificateCid";

ALTER TABLE "KybSubmission" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "KybSubmission" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "KybSubmission" ADD COLUMN "reviewedBy" TEXT;

-- ─── KycSubmission: drop CID columns, add review fields ──────────────────────

ALTER TABLE "KycSubmission" DROP COLUMN "governmentIdCid";
ALTER TABLE "KycSubmission" DROP COLUMN "proofOfAddressCid";
ALTER TABLE "KycSubmission" DROP COLUMN "rutDocumentCid";

ALTER TABLE "KycSubmission" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "KycSubmission" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "KycSubmission" ADD COLUMN "reviewedBy" TEXT;

-- ─── SubmissionDocument: binary file storage ──────────────────────────────────

CREATE TABLE "SubmissionDocument" (
  "id"              TEXT         NOT NULL,
  "userId"          TEXT         NOT NULL,
  "kybSubmissionId" TEXT,
  "kycSubmissionId" TEXT,
  "fieldName"       TEXT         NOT NULL,
  "filename"        TEXT         NOT NULL,
  "mimeType"        TEXT         NOT NULL,
  "sizeBytes"       INTEGER      NOT NULL,
  "content"         BYTEA        NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubmissionDocument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SubmissionDocument"
  ADD CONSTRAINT "SubmissionDocument_kybSubmissionId_fkey"
  FOREIGN KEY ("kybSubmissionId") REFERENCES "KybSubmission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubmissionDocument"
  ADD CONSTRAINT "SubmissionDocument_kycSubmissionId_fkey"
  FOREIGN KEY ("kycSubmissionId") REFERENCES "KycSubmission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

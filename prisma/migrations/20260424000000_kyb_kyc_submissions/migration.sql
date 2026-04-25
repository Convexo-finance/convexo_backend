-- ─── KybSubmission ────────────────────────────────────────────────────────────

CREATE TABLE "KybSubmission" (
  "id"                            TEXT NOT NULL,
  "userId"                        TEXT NOT NULL,
  "companyName"                   TEXT NOT NULL,
  "country"                       TEXT NOT NULL,
  "companyType"                   TEXT NOT NULL,
  "incorporationNumber"           TEXT NOT NULL,
  "taxNumber"                     TEXT NOT NULL,
  "street"                        TEXT NOT NULL,
  "city"                          TEXT NOT NULL,
  "stateRegion"                   TEXT,
  "officeCountry"                 TEXT NOT NULL,
  "repFirstName"                  TEXT NOT NULL,
  "repLastName"                   TEXT NOT NULL,
  "repDocType"                    TEXT NOT NULL,
  "repDocNumber"                  TEXT NOT NULL,
  "repEmail"                      TEXT NOT NULL,
  "repPhone"                      TEXT NOT NULL,
  "shareholders"                  JSONB NOT NULL,
  "incorporationCertificateCid"   TEXT NOT NULL,
  "taxDocumentCid"                TEXT NOT NULL,
  "proofOfAddressCid"             TEXT NOT NULL,
  "representativeIdCid"           TEXT NOT NULL,
  "shareholdersCertificateCid"    TEXT,
  "status"                        TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KybSubmission_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "KybSubmission"
  ADD CONSTRAINT "KybSubmission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── KycSubmission ────────────────────────────────────────────────────────────

CREATE TABLE "KycSubmission" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "governmentIdCid"   TEXT NOT NULL,
  "proofOfAddressCid" TEXT NOT NULL,
  "rutDocumentCid"    TEXT,
  "status"            TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KycSubmission_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "KycSubmission"
  ADD CONSTRAINT "KycSubmission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

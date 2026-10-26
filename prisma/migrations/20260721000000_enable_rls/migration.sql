-- Enable Row Level Security on every table.
--
-- WHY: on Supabase, every project exposes a PostgREST Data API reachable with the
-- public `anon` key. Without RLS, that key can read (and write) every row in these
-- tables from the open internet. We do not use the Data API at all — the backend
-- talks to Postgres directly via Prisma as the `postgres` role, which OWNS these
-- tables and therefore bypasses RLS. So enabling RLS with **no policies** closes the
-- Data API hole and changes nothing for the application.
--
-- This was previously applied by hand in the Supabase SQL editor and was NOT tracked
-- in migrations, so it silently failed to carry over to a new project. Keeping it here
-- means `prisma migrate deploy` reapplies it on any fresh database automatically.
--
-- NOTE: do not add policies here. If a future feature needs client-side Data API
-- access, add scoped policies in a new migration.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IndividualProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReputationCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KybSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KycSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubmissionDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentExtraction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditScoreRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OtcOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FundingRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vault" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExchangeRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminRole" ENABLE ROW LEVEL SECURITY;

-- ─── BankAccount: new required fields ────────────────────────────────────────

-- Backfill holderName for any existing NULL rows before setting NOT NULL
UPDATE "BankAccount" SET "holderName" = '' WHERE "holderName" IS NULL;
ALTER TABLE "BankAccount" ALTER COLUMN "holderName" SET NOT NULL;

ALTER TABLE "BankAccount" ADD COLUMN "bankCountry"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "BankAccount" ADD COLUMN "documentType"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "BankAccount" ADD COLUMN "documentNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BankAccount" ADD COLUMN "bankAddress"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "BankAccount" ADD COLUMN "bankCity"       TEXT NOT NULL DEFAULT '';
ALTER TABLE "BankAccount" ADD COLUMN "bankState"      TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "swiftCode"      TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "routingNumber"  TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "iban"           TEXT;

-- ─── OtcOrderStatus: add CONFIRMED value ──────────────────────────────────────

ALTER TYPE "OtcOrderStatus" ADD VALUE 'CONFIRMED';

-- ─── OtcOrder: make legacy fields optional, add new fields ───────────────────

ALTER TABLE "OtcOrder" ALTER COLUMN "tokenIn"  DROP NOT NULL;
ALTER TABLE "OtcOrder" ALTER COLUMN "tokenOut" DROP NOT NULL;
ALTER TABLE "OtcOrder" ALTER COLUMN "amountIn" DROP NOT NULL;
ALTER TABLE "OtcOrder" ALTER COLUMN "network"  DROP NOT NULL;

ALTER TABLE "OtcOrder" ADD COLUMN "orderId"           TEXT UNIQUE;
ALTER TABLE "OtcOrder" ADD COLUMN "digitalAsset"      TEXT;
ALTER TABLE "OtcOrder" ADD COLUMN "fiatCurrency"      TEXT;
ALTER TABLE "OtcOrder" ADD COLUMN "assetAmount"       DECIMAL(18,6);
ALTER TABLE "OtcOrder" ADD COLUMN "estimatedFiat"     DECIMAL(18,2);
ALTER TABLE "OtcOrder" ADD COLUMN "rate"              DECIMAL(18,6);
ALTER TABLE "OtcOrder" ADD COLUMN "walletAddress"     TEXT;
ALTER TABLE "OtcOrder" ADD COLUMN "frontendTimestamp" TIMESTAMP(3);
ALTER TABLE "OtcOrder" ADD COLUMN "bankName"          TEXT;
ALTER TABLE "OtcOrder" ADD COLUMN "bankAccount"       TEXT;
ALTER TABLE "OtcOrder" ADD COLUMN "bankAccountType"   TEXT;
ALTER TABLE "OtcOrder" ADD COLUMN "holderName"        TEXT;
ALTER TABLE "OtcOrder" ADD COLUMN "accountLabel"      TEXT;

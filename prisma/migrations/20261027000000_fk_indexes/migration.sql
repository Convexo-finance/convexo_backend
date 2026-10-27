-- AlterTable
ALTER TABLE "BankAccount" ALTER COLUMN "bankCountry" DROP DEFAULT,
ALTER COLUMN "documentType" DROP DEFAULT,
ALTER COLUMN "documentNumber" DROP DEFAULT,
ALTER COLUMN "bankAddress" DROP DEFAULT,
ALTER COLUMN "bankCity" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "BankAccount_userId_idx" ON "BankAccount"("userId");

-- CreateIndex
CREATE INDEX "CreditScoreRequest_userId_idx" ON "CreditScoreRequest"("userId");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE INDEX "FundingRequest_userId_idx" ON "FundingRequest"("userId");

-- CreateIndex
CREATE INDEX "KybSubmission_userId_idx" ON "KybSubmission"("userId");

-- CreateIndex
CREATE INDEX "KycSubmission_userId_idx" ON "KycSubmission"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_idx" ON "NotificationLog"("userId");

-- CreateIndex
CREATE INDEX "OtcOrder_userId_idx" ON "OtcOrder"("userId");

-- CreateIndex
CREATE INDEX "SubmissionDocument_kybSubmissionId_idx" ON "SubmissionDocument"("kybSubmissionId");

-- CreateIndex
CREATE INDEX "SubmissionDocument_kycSubmissionId_idx" ON "SubmissionDocument"("kycSubmissionId");

-- CreateIndex
CREATE INDEX "SubmissionDocument_creditScoreRequestId_idx" ON "SubmissionDocument"("creditScoreRequestId");

-- CreateIndex
CREATE INDEX "Verification_userId_idx" ON "Verification"("userId");


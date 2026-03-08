-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('EMAIL', 'PASSKEY', 'GOOGLE', 'WALLET_CONNECT', 'METAMASK', 'COINBASE', 'EXTERNAL_EOA');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('NOT_STARTED', 'TYPE_SELECTED', 'PROFILE_COMPLETE', 'HUMANITY_PENDING', 'HUMANITY_COMPLETE', 'KYC_PENDING', 'KYB_PENDING', 'LP_COMPLETE', 'CREDIT_SCORE_PENDING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('MICRO', 'SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('HUMANITY', 'KYC_INDIVIDUAL', 'KYB_BUSINESS', 'CREDIT_SCORE');

-- CreateEnum
CREATE TYPE "VerificationProvider" AS ENUM ('ZKPASSPORT', 'VERIFF', 'SUMSUB', 'INTERNAL');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'EXPIRED', 'RESUBMISSION_REQUESTED');

-- CreateEnum
CREATE TYPE "CreditScoreStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NFT_REQUESTED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('SAVINGS', 'CHECKING', 'BUSINESS');

-- CreateEnum
CREATE TYPE "BankAccountStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PROVIDER', 'FRIEND', 'CLIENT', 'FAMILY', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('GENERAL', 'VAULT_CONTRACT', 'KYC_DOCUMENT', 'KYB_DOCUMENT', 'INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW', 'CREDIT_SCORE_REQUEST', 'FUNDING_REQUEST', 'NFT_METADATA');

-- CreateEnum
CREATE TYPE "OtcOrderType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OtcOrderStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FundingRequestStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'VAULT_CREATED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "AdminRoleType" AS ENUM ('VIEWER', 'VERIFIER', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "smartAccount" TEXT,
    "authMethod" "AuthMethod" NOT NULL DEFAULT 'EXTERNAL_EOA',
    "chainId" INTEGER NOT NULL DEFAULT 8453,
    "nonce" TEXT,
    "accountType" "AccountType",
    "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'NOT_STARTED',
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "displayName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "countryOfResidence" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "telegram" TEXT,
    "twitter" TEXT,
    "linkedin" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndividualProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "legalName" TEXT,
    "taxId" TEXT,
    "registrationNumber" TEXT,
    "industry" TEXT,
    "companySize" "CompanySize",
    "foundedYear" INTEGER,
    "website" TEXT,
    "description" TEXT,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "telegram" TEXT,
    "linkedin" TEXT,
    "logoUrl" TEXT,
    "repFirstName" TEXT,
    "repLastName" TEXT,
    "repTitle" TEXT,
    "repEmail" TEXT,
    "repPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 0,
    "tierName" TEXT NOT NULL DEFAULT 'None',
    "passportBalance" TEXT NOT NULL DEFAULT '0',
    "lpIndividualsBalance" TEXT NOT NULL DEFAULT '0',
    "lpBusinessBalance" TEXT NOT NULL DEFAULT '0',
    "ecreditscoringBalance" TEXT NOT NULL DEFAULT '0',
    "canAccessTreasury" BOOLEAN NOT NULL DEFAULT false,
    "canInvestInVaults" BOOLEAN NOT NULL DEFAULT false,
    "canAccessLPPools" BOOLEAN NOT NULL DEFAULT false,
    "canRequestCreditScore" BOOLEAN NOT NULL DEFAULT false,
    "canCreateVaults" BOOLEAN NOT NULL DEFAULT false,
    "canAccessFunding" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedFromChainId" INTEGER NOT NULL DEFAULT 8453,

    CONSTRAINT "ReputationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "provider" "VerificationProvider" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "veriffUrl" TEXT,
    "applicantId" TEXT,
    "levelName" TEXT,
    "zkProofHash" TEXT,
    "rejectionReason" TEXT,
    "nftTokenId" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditScoreRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incomeStatementCid" TEXT,
    "balanceSheetCid" TEXT,
    "cashFlowCid" TEXT,
    "period" TEXT,
    "annualRevenue" TEXT,
    "netProfit" TEXT,
    "totalAssets" TEXT,
    "totalLiabilities" TEXT,
    "employeeCount" INTEGER,
    "yearsOperating" INTEGER,
    "existingDebt" TEXT,
    "monthlyExpenses" TEXT,
    "additionalContext" TEXT,
    "status" "CreditScoreStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "rating" TEXT,
    "approved" BOOLEAN,
    "maxCreditLimit" TEXT,
    "analysisNotes" TEXT,
    "rejectionReason" TEXT,
    "n8nExecutionId" TEXT,
    "submittedToN8nAt" TIMESTAMP(3),
    "n8nCallbackAt" TIMESTAMP(3),
    "nftTokenId" TEXT,
    "nftMintedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditScoreRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumberMasked" TEXT NOT NULL,
    "accountNumberEncrypted" TEXT,
    "accountType" "BankAccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "holderName" TEXT,
    "status" "BankAccountStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "type" "ContactType" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "ipfsCid" TEXT NOT NULL,
    "ipfsUrl" TEXT NOT NULL,
    "pinataGroupId" TEXT,
    "documentHash" TEXT,
    "category" "DocumentCategory" NOT NULL DEFAULT 'GENERAL',
    "vaultId" TEXT,
    "contractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtcOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderType" "OtcOrderType" NOT NULL,
    "tokenIn" TEXT NOT NULL,
    "tokenOut" TEXT NOT NULL,
    "amountIn" TEXT NOT NULL,
    "amountOut" TEXT,
    "priceUSD" TEXT,
    "network" TEXT NOT NULL,
    "status" "OtcOrderStatus" NOT NULL DEFAULT 'PENDING',
    "telegramSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtcOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "purpose" TEXT NOT NULL,
    "term" INTEGER,
    "interestRate" TEXT,
    "collateral" TEXT,
    "status" "FundingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "vaultId" TEXT,
    "adminNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AdminRoleType" NOT NULL DEFAULT 'VIEWER',
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_smartAccount_key" ON "User"("smartAccount");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualProfile_userId_key" ON "IndividualProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_userId_key" ON "BusinessProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationCache_userId_key" ON "ReputationCache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_sessionId_key" ON "Verification"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_address_key" ON "Contact"("userId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_pair_key" ON "ExchangeRate"("pair");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_userId_key" ON "AdminRole"("userId");

-- AddForeignKey
ALTER TABLE "IndividualProfile" ADD CONSTRAINT "IndividualProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationCache" ADD CONSTRAINT "ReputationCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditScoreRequest" ADD CONSTRAINT "CreditScoreRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtcOrder" ADD CONSTRAINT "OtcOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRequest" ADD CONSTRAINT "FundingRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRole" ADD CONSTRAINT "AdminRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

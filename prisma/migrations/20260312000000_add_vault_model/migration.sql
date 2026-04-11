-- CreateTable
CREATE TABLE "Vault" (
    "id" TEXT NOT NULL,
    "onchainVaultId" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 84532,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "principalAmount" TEXT NOT NULL,
    "interestRate" TEXT NOT NULL,
    "protocolFeeRate" TEXT NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "totalShareSupply" TEXT NOT NULL,
    "minInvestment" TEXT NOT NULL,
    "borrowerAddress" TEXT NOT NULL,
    "fundingRequestId" TEXT,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vault_vaultAddress_key" ON "Vault"("vaultAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Vault_fundingRequestId_key" ON "Vault"("fundingRequestId");

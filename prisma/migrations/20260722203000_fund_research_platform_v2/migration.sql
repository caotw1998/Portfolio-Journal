ALTER TABLE "Fund"
ADD COLUMN "rawType" TEXT,
ADD COLUMN "assetClass" TEXT,
ADD COLUMN "managementStyle" TEXT,
ADD COLUMN "vehicleType" TEXT,
ADD COLUMN "investmentRegion" TEXT,
ADD COLUMN "shareClass" TEXT;

ALTER TABLE "UserFund"
ADD COLUMN "researchStage" TEXT NOT NULL DEFAULT 'discover',
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "thesis" TEXT,
ADD COLUMN "keyRisks" TEXT,
ADD COLUMN "nextReviewDate" DATE;

ALTER TABLE "FundSourceSnapshot"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "contentHash" TEXT,
ADD COLUMN "missingFields" JSONB,
ADD COLUMN "coverageJson" JSONB;

CREATE TABLE "FundCatalogEntry" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "market" TEXT NOT NULL DEFAULT 'CN_FUND', "name" TEXT NOT NULL,
  "rawType" TEXT, "source" TEXT NOT NULL, "sourceUrl" TEXT, "official" BOOLEAN NOT NULL DEFAULT false,
  "lastVerifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundCatalogEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundCatalogEntry_code_market_key" ON "FundCatalogEntry"("code", "market");
CREATE INDEX "FundCatalogEntry_name_idx" ON "FundCatalogEntry"("name");
CREATE INDEX "FundCatalogEntry_source_official_idx" ON "FundCatalogEntry"("source", "official");

CREATE TABLE "FundFlowSnapshot" (
  "id" TEXT NOT NULL, "fundId" TEXT NOT NULL, "reportDate" DATE NOT NULL, "subscriptions" DECIMAL(24,4),
  "redemptions" DECIMAL(24,4), "totalShares" DECIMAL(24,4), "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundFlowSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundFlowSnapshot_fundId_reportDate_key" ON "FundFlowSnapshot"("fundId", "reportDate");
CREATE INDEX "FundFlowSnapshot_fundId_reportDate_idx" ON "FundFlowSnapshot"("fundId", "reportDate");
ALTER TABLE "FundFlowSnapshot" ADD CONSTRAINT "FundFlowSnapshot_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundHolderSnapshot" (
  "id" TEXT NOT NULL, "fundId" TEXT NOT NULL, "reportDate" DATE NOT NULL, "institutionPercent" DECIMAL(12,6),
  "individualPercent" DECIMAL(12,6), "internalPercent" DECIMAL(12,6), "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundHolderSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundHolderSnapshot_fundId_reportDate_key" ON "FundHolderSnapshot"("fundId", "reportDate");
CREATE INDEX "FundHolderSnapshot_fundId_reportDate_idx" ON "FundHolderSnapshot"("fundId", "reportDate");
ALTER TABLE "FundHolderSnapshot" ADD CONSTRAINT "FundHolderSnapshot_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundDividendEvent" (
  "id" TEXT NOT NULL, "fundId" TEXT NOT NULL, "exDate" DATE, "recordDate" DATE, "paymentDate" DATE,
  "amount" DECIMAL(20,8), "description" TEXT, "source" TEXT NOT NULL, "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundDividendEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FundDividendEvent_fundId_exDate_idx" ON "FundDividendEvent"("fundId", "exDate");
ALTER TABLE "FundDividendEvent" ADD CONSTRAINT "FundDividendEvent_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundDocument" (
  "id" TEXT NOT NULL, "fundId" TEXT NOT NULL, "documentType" TEXT NOT NULL, "title" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3), "periodEnd" DATE, "source" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL, "contentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundDocument_fundId_sourceUrl_key" ON "FundDocument"("fundId", "sourceUrl");
CREATE INDEX "FundDocument_fundId_publishedAt_idx" ON "FundDocument"("fundId", "publishedAt");
ALTER TABLE "FundDocument" ADD CONSTRAINT "FundDocument_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundSyncRun" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "requestedSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundSyncRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FundSyncRun_userId_createdAt_idx" ON "FundSyncRun"("userId", "createdAt");
CREATE INDEX "FundSyncRun_status_createdAt_idx" ON "FundSyncRun"("status", "createdAt");
ALTER TABLE "FundSyncRun" ADD CONSTRAINT "FundSyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundSyncRunItem" (
  "id" TEXT NOT NULL, "syncRunId" TEXT NOT NULL, "fundId" TEXT NOT NULL, "section" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued',
  "attemptCount" INTEGER NOT NULL DEFAULT 0, "error" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundSyncRunItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundSyncRunItem_syncRunId_fundId_section_key" ON "FundSyncRunItem"("syncRunId", "fundId", "section");
CREATE INDEX "FundSyncRunItem_fundId_createdAt_idx" ON "FundSyncRunItem"("fundId", "createdAt");
CREATE INDEX "FundSyncRunItem_status_createdAt_idx" ON "FundSyncRunItem"("status", "createdAt");
ALTER TABLE "FundSyncRunItem" ADD CONSTRAINT "FundSyncRunItem_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "FundSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FundSyncRunItem" ADD CONSTRAINT "FundSyncRunItem_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ModelPortfolio" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "startDate" DATE NOT NULL, "benchmarkId" TEXT,
  "rebalanceFrequency" TEXT NOT NULL DEFAULT 'quarterly', "transactionCostBps" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "cashAnnualReturn" DECIMAL(12,8) NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelPortfolio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModelPortfolio_userId_createdAt_idx" ON "ModelPortfolio"("userId", "createdAt");
ALTER TABLE "ModelPortfolio" ADD CONSTRAINT "ModelPortfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ModelPortfolioAllocation" (
  "id" TEXT NOT NULL, "modelPortfolioId" TEXT NOT NULL, "fundId" TEXT NOT NULL, "targetWeight" DECIMAL(12,8) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelPortfolioAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModelPortfolioAllocation_modelPortfolioId_fundId_key" ON "ModelPortfolioAllocation"("modelPortfolioId", "fundId");
CREATE INDEX "ModelPortfolioAllocation_fundId_idx" ON "ModelPortfolioAllocation"("fundId");
ALTER TABLE "ModelPortfolioAllocation" ADD CONSTRAINT "ModelPortfolioAllocation_modelPortfolioId_fkey" FOREIGN KEY ("modelPortfolioId") REFERENCES "ModelPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelPortfolioAllocation" ADD CONSTRAINT "ModelPortfolioAllocation_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

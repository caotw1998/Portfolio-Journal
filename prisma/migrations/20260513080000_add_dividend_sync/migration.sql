-- Add dividend sync event cache and per-portfolio asset preferences.

CREATE TABLE "PortfolioAssetPreference" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "dividendMode" TEXT NOT NULL DEFAULT 'cash_dividend',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PortfolioAssetPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DividendEvent" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "announcementDate" TIMESTAMP(3),
  "recordDate" TIMESTAMP(3),
  "exDividendDate" TIMESTAMP(3),
  "paymentDate" TIMESTAMP(3),
  "cashPerShare" DOUBLE PRECISION NOT NULL,
  "bonusShareRatio" DOUBLE PRECISION,
  "transferShareRatio" DOUBLE PRECISION,
  "source" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DividendEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarketDataSyncJob"
  ADD COLUMN "dividendEventCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cashDividendTransactionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reinvestDividendTransactionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "skippedDividendCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "PortfolioAssetPreference_portfolioId_assetId_key"
  ON "PortfolioAssetPreference"("portfolioId", "assetId");

CREATE INDEX "PortfolioAssetPreference_assetId_idx"
  ON "PortfolioAssetPreference"("assetId");

CREATE UNIQUE INDEX "DividendEvent_assetId_source_sourceEventId_key"
  ON "DividendEvent"("assetId", "source", "sourceEventId");

CREATE INDEX "DividendEvent_assetId_paymentDate_idx"
  ON "DividendEvent"("assetId", "paymentDate");

CREATE INDEX "DividendEvent_assetId_exDividendDate_idx"
  ON "DividendEvent"("assetId", "exDividendDate");

CREATE INDEX "Transaction_portfolioId_assetId_sourceRef_idx"
  ON "Transaction"("portfolioId", "assetId", "sourceRef");

ALTER TABLE "PortfolioAssetPreference"
  ADD CONSTRAINT "PortfolioAssetPreference_portfolioId_fkey"
  FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortfolioAssetPreference"
  ADD CONSTRAINT "PortfolioAssetPreference_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DividendEvent"
  ADD CONSTRAINT "DividendEvent_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

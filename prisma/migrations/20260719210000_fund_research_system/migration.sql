-- Preserve every fund that appeared in a user's holdings or transactions.
CREATE TEMP TABLE "_FundMigrationUser" AS
SELECT DISTINCT "Portfolio"."userId", "Asset"."id" AS "fundId"
FROM "HoldingSnapshot"
JOIN "Portfolio" ON "Portfolio"."id" = "HoldingSnapshot"."portfolioId"
JOIN "Asset" ON "Asset"."id" = "HoldingSnapshot"."assetId"
WHERE LOWER("Asset"."type") = 'fund'
UNION
SELECT DISTINCT "Portfolio"."userId", "Asset"."id" AS "fundId"
FROM "Transaction"
JOIN "Portfolio" ON "Portfolio"."id" = "Transaction"."portfolioId"
JOIN "Asset" ON "Asset"."id" = "Transaction"."assetId"
WHERE LOWER("Asset"."type") = 'fund';

-- Remove ledger-only data and its relationships before converting assets to funds.
DROP TABLE "MarketDataSyncJob";
DROP TABLE "PortfolioAssetPreference";
DROP TABLE "DividendEvent";
DROP TABLE "DailyPerformance";
DROP TABLE "PortfolioRecalcQueue";
DROP TABLE "HoldingSnapshot";
DROP TABLE "Transaction";
DROP TABLE "CodexIngestionLog";
DROP TABLE "Portfolio";

DELETE FROM "AuditLog"
WHERE "entityType" IN (
  'portfolio',
  'holding_snapshot',
  'transaction',
  'daily_performance',
  'portfolio_recalc_queue',
  'market_data_sync_job',
  'portfolio_asset_preference',
  'dividend_event',
  'codex_ingestion_log'
);

-- Keep researchable funds and their existing cached/net-value history only.
DELETE FROM "FundDetailCache"
WHERE "assetId" IN (SELECT "id" FROM "Asset" WHERE LOWER("type") <> 'fund');
DELETE FROM "AssetPriceSnapshot"
WHERE "assetId" IN (SELECT "id" FROM "Asset" WHERE LOWER("type") <> 'fund');
DELETE FROM "Asset" WHERE LOWER("type") <> 'fund';

ALTER TABLE "Asset" RENAME TO "Fund";
ALTER TABLE "Fund" RENAME COLUMN "symbol" TO "code";
ALTER TABLE "Fund"
  ADD COLUMN "company" TEXT,
  ADD COLUMN "establishedDate" DATE,
  ADD COLUMN "benchmarkDescription" TEXT,
  ADD COLUMN "subscribeStatus" TEXT,
  ADD COLUMN "redeemStatus" TEXT,
  ADD COLUMN "latestSyncAt" TIMESTAMP(3),
  ADD COLUMN "latestSyncError" TEXT;
ALTER TABLE "Fund" ALTER COLUMN "market" SET DEFAULT 'CN_FUND';
ALTER TABLE "Fund" ALTER COLUMN "type" SET DEFAULT 'fund';
ALTER TABLE "Fund" ALTER COLUMN "currency" SET DEFAULT 'CNY';
ALTER INDEX "Asset_pkey" RENAME TO "Fund_pkey";
ALTER INDEX "Asset_symbol_market_key" RENAME TO "Fund_code_market_key";
CREATE INDEX "Fund_name_idx" ON "Fund"("name");
CREATE INDEX "Fund_latestSyncAt_idx" ON "Fund"("latestSyncAt");

ALTER TABLE "AssetPriceSnapshot" RENAME TO "FundNavSnapshot";
ALTER TABLE "FundNavSnapshot" RENAME COLUMN "assetId" TO "fundId";
ALTER TABLE "FundNavSnapshot" RENAME COLUMN "date" TO "valuationDate";
ALTER TABLE "FundNavSnapshot" RENAME COLUMN "observedDate" TO "publishedAt";
ALTER TABLE "FundNavSnapshot" RENAME COLUMN "closePrice" TO "unitNav";
ALTER TABLE "FundNavSnapshot" ALTER COLUMN "valuationDate" TYPE DATE USING "valuationDate"::date;
ALTER TABLE "FundNavSnapshot" ALTER COLUMN "unitNav" TYPE NUMERIC(20, 8) USING "unitNav"::numeric;
ALTER TABLE "FundNavSnapshot" DROP COLUMN "currency";
ALTER TABLE "FundNavSnapshot"
  ADD COLUMN "accumulatedNav" NUMERIC(20, 8),
  ADD COLUMN "dailyReturn" NUMERIC(12, 8);
ALTER TABLE "FundNavSnapshot" RENAME CONSTRAINT "AssetPriceSnapshot_assetId_fkey" TO "FundNavSnapshot_fundId_fkey";
ALTER INDEX "AssetPriceSnapshot_pkey" RENAME TO "FundNavSnapshot_pkey";
ALTER INDEX "AssetPriceSnapshot_assetId_date_key" RENAME TO "FundNavSnapshot_fundId_valuationDate_key";
CREATE INDEX "FundNavSnapshot_fundId_valuationDate_idx" ON "FundNavSnapshot"("fundId", "valuationDate");

ALTER TABLE "FundDetailCache" RENAME TO "FundSourceSnapshot";
ALTER TABLE "FundSourceSnapshot" RENAME COLUMN "assetId" TO "fundId";
ALTER TABLE "FundSourceSnapshot" RENAME COLUMN "payloadJson" TO "rawJson";
ALTER TABLE "FundSourceSnapshot" ALTER COLUMN "asOfDate" TYPE DATE USING "asOfDate"::date;
ALTER TABLE "FundSourceSnapshot" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "FundSourceSnapshot" RENAME CONSTRAINT "FundDetailCache_assetId_fkey" TO "FundSourceSnapshot_fundId_fkey";
ALTER INDEX "FundDetailCache_pkey" RENAME TO "FundSourceSnapshot_pkey";
ALTER INDEX "FundDetailCache_assetId_source_section_key" RENAME TO "FundSourceSnapshot_fundId_source_section_key";
ALTER INDEX "FundDetailCache_assetId_section_idx" RENAME TO "FundSourceSnapshot_fundId_section_idx";
ALTER INDEX "FundDetailCache_expiresAt_idx" RENAME TO "FundSourceSnapshot_expiresAt_idx";

CREATE TABLE "UserFund" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserFund_pkey" PRIMARY KEY ("id")
);

INSERT INTO "UserFund" ("id", "userId", "fundId", "updatedAt")
SELECT 'migrated_' || md5("userId" || ':' || "fundId"), "userId", "fundId", CURRENT_TIMESTAMP
FROM "_FundMigrationUser";

CREATE UNIQUE INDEX "UserFund_userId_fundId_key" ON "UserFund"("userId", "fundId");
CREATE INDEX "UserFund_fundId_idx" ON "UserFund"("fundId");
CREATE INDEX "UserFund_userId_createdAt_idx" ON "UserFund"("userId", "createdAt");
ALTER TABLE "UserFund" ADD CONSTRAINT "UserFund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFund" ADD CONSTRAINT "UserFund_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundManagerTenure" (
  "id" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "managerName" TEXT NOT NULL,
  "startDate" DATE,
  "endDate" DATE,
  "tenureReturn" NUMERIC(12, 8),
  "source" TEXT NOT NULL,
  "asOfDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundManagerTenure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundManagerTenure_fundId_managerName_startDate_key" ON "FundManagerTenure"("fundId", "managerName", "startDate");
CREATE INDEX "FundManagerTenure_fundId_endDate_idx" ON "FundManagerTenure"("fundId", "endDate");
ALTER TABLE "FundManagerTenure" ADD CONSTRAINT "FundManagerTenure_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundPortfolioReport" (
  "id" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "reportDate" DATE NOT NULL,
  "stockPercent" NUMERIC(12, 6),
  "bondPercent" NUMERIC(12, 6),
  "cashPercent" NUMERIC(12, 6),
  "otherPercent" NUMERIC(12, 6),
  "industryJson" JSONB,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundPortfolioReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundPortfolioReport_fundId_reportDate_key" ON "FundPortfolioReport"("fundId", "reportDate");
CREATE INDEX "FundPortfolioReport_fundId_reportDate_idx" ON "FundPortfolioReport"("fundId", "reportDate");
ALTER TABLE "FundPortfolioReport" ADD CONSTRAINT "FundPortfolioReport_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundHolding" (
  "id" TEXT NOT NULL,
  "portfolioReportId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "weight" NUMERIC(12, 6),
  "marketValue" NUMERIC(24, 4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundHolding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundHolding_portfolioReportId_kind_rank_key" ON "FundHolding"("portfolioReportId", "kind", "rank");
CREATE INDEX "FundHolding_portfolioReportId_idx" ON "FundHolding"("portfolioReportId");
ALTER TABLE "FundHolding" ADD CONSTRAINT "FundHolding_portfolioReportId_fkey" FOREIGN KEY ("portfolioReportId") REFERENCES "FundPortfolioReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundScaleSnapshot" (
  "id" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "reportDate" DATE NOT NULL,
  "netAssets" NUMERIC(24, 4),
  "shares" NUMERIC(24, 4),
  "holderCount" BIGINT,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundScaleSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundScaleSnapshot_fundId_reportDate_key" ON "FundScaleSnapshot"("fundId", "reportDate");
CREATE INDEX "FundScaleSnapshot_fundId_reportDate_idx" ON "FundScaleSnapshot"("fundId", "reportDate");
ALTER TABLE "FundScaleSnapshot" ADD CONSTRAINT "FundScaleSnapshot_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BenchmarkPriceSnapshot" ALTER COLUMN "date" TYPE DATE USING "date"::date;
ALTER TABLE "BenchmarkPriceSnapshot" ALTER COLUMN "closeValue" TYPE NUMERIC(20, 8) USING "closeValue"::numeric;
UPDATE "BenchmarkInstrument" SET "provider" = 'public_market' WHERE "provider" <> 'manual';

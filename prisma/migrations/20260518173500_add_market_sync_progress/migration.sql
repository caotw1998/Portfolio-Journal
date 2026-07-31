-- Persist market sync mode and progress so pending jobs can continue.

ALTER TABLE "MarketDataSyncJob"
  ADD COLUMN "syncPrices" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "syncDividends" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "processedAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "totalAssetCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastProcessedAssetId" TEXT;

CREATE INDEX "MarketDataSyncJob_portfolioId_status_fromDate_syncPrices_syncDividends_idx"
  ON "MarketDataSyncJob"("portfolioId", "status", "fromDate", "syncPrices", "syncDividends");

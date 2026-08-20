CREATE TABLE "Stock" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "market" TEXT NOT NULL, "name" TEXT NOT NULL,
  "sourceSymbol" TEXT NOT NULL, "currency" TEXT NOT NULL, "latestSyncAt" TIMESTAMP(3), "latestSyncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserStock" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "stockId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserStock_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StockPriceSnapshot" (
  "id" TEXT NOT NULL, "stockId" TEXT NOT NULL, "date" DATE NOT NULL, "close" DECIMAL(20,8) NOT NULL, "source" TEXT NOT NULL,
  CONSTRAINT "StockPriceSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StockDividendEvent" (
  "id" TEXT NOT NULL, "stockId" TEXT NOT NULL, "exDate" DATE NOT NULL, "amount" DECIMAL(20,8) NOT NULL, "source" TEXT NOT NULL,
  CONSTRAINT "StockDividendEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Stock_code_market_key" ON "Stock"("code", "market");
CREATE INDEX "Stock_name_idx" ON "Stock"("name");
CREATE UNIQUE INDEX "UserStock_userId_stockId_key" ON "UserStock"("userId", "stockId");
CREATE INDEX "UserStock_stockId_idx" ON "UserStock"("stockId");
CREATE UNIQUE INDEX "StockPriceSnapshot_stockId_date_key" ON "StockPriceSnapshot"("stockId", "date");
CREATE INDEX "StockPriceSnapshot_stockId_date_idx" ON "StockPriceSnapshot"("stockId", "date");
CREATE UNIQUE INDEX "StockDividendEvent_stockId_exDate_key" ON "StockDividendEvent"("stockId", "exDate");
CREATE INDEX "StockDividendEvent_stockId_exDate_idx" ON "StockDividendEvent"("stockId", "exDate");
ALTER TABLE "UserStock" ADD CONSTRAINT "UserStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserStock" ADD CONSTRAINT "UserStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockPriceSnapshot" ADD CONSTRAINT "StockPriceSnapshot_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockDividendEvent" ADD CONSTRAINT "StockDividendEvent_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

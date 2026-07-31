-- CreateTable
CREATE TABLE "MarketDataSyncJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fromDate" TIMESTAMP(3) NOT NULL,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketDataSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketDataSyncJob_userId_status_createdAt_idx" ON "MarketDataSyncJob"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketDataSyncJob_portfolioId_status_fromDate_idx" ON "MarketDataSyncJob"("portfolioId", "status", "fromDate");

-- AddForeignKey
ALTER TABLE "MarketDataSyncJob" ADD CONSTRAINT "MarketDataSyncJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketDataSyncJob" ADD CONSTRAINT "MarketDataSyncJob_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

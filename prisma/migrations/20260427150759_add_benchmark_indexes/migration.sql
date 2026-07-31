-- AlterTable
ALTER TABLE "Portfolio" ADD COLUMN "defaultBenchmarkId" TEXT;

-- CreateTable
CREATE TABLE "BenchmarkInstrument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkPriceSnapshot" (
    "id" TEXT NOT NULL,
    "benchmarkInstrumentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "closeValue" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkInstrument_userId_code_market_key" ON "BenchmarkInstrument"("userId", "code", "market");

-- CreateIndex
CREATE INDEX "BenchmarkInstrument_userId_status_createdAt_idx" ON "BenchmarkInstrument"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkPriceSnapshot_benchmarkInstrumentId_date_key" ON "BenchmarkPriceSnapshot"("benchmarkInstrumentId", "date");

-- CreateIndex
CREATE INDEX "BenchmarkPriceSnapshot_benchmarkInstrumentId_date_idx" ON "BenchmarkPriceSnapshot"("benchmarkInstrumentId", "date");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_defaultBenchmarkId_fkey" FOREIGN KEY ("defaultBenchmarkId") REFERENCES "BenchmarkInstrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkInstrument" ADD CONSTRAINT "BenchmarkInstrument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkPriceSnapshot" ADD CONSTRAINT "BenchmarkPriceSnapshot_benchmarkInstrumentId_fkey" FOREIGN KEY ("benchmarkInstrumentId") REFERENCES "BenchmarkInstrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

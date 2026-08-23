ALTER TABLE "BenchmarkValuationSnapshot"
ADD COLUMN "riskFreeRate" DECIMAL(20,8),
ADD COLUMN "riskFreeRateSource" TEXT,
ADD COLUMN "riskFreeRateSourceUrl" TEXT;

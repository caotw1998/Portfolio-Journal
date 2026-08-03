ALTER TABLE "BenchmarkInstrument"
  ADD COLUMN "valuationLastSyncAt" TIMESTAMP(3),
  ADD COLUMN "valuationLastSyncError" TEXT;

CREATE TABLE "BenchmarkValuationSnapshot" (
    "id" TEXT NOT NULL,
    "benchmarkInstrumentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "peTtm" DECIMAL(20,8),
    "pb" DECIMAL(20,8),
    "dividendYield" DECIMAL(20,8),
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BenchmarkValuationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BenchmarkValuationSnapshot_benchmarkInstrumentId_date_key"
ON "BenchmarkValuationSnapshot"("benchmarkInstrumentId", "date");

ALTER TABLE "BenchmarkValuationSnapshot"
ADD CONSTRAINT "BenchmarkValuationSnapshot_benchmarkInstrumentId_fkey"
FOREIGN KEY ("benchmarkInstrumentId") REFERENCES "BenchmarkInstrument"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

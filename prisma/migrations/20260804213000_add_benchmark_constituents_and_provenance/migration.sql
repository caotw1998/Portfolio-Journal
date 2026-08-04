ALTER TABLE "BenchmarkInstrument"
ADD COLUMN "constituentLastSyncAt" TIMESTAMP(3),
ADD COLUMN "constituentLastSyncError" TEXT,
ADD COLUMN "seriesType" TEXT NOT NULL DEFAULT 'price',
ADD COLUMN "parentIndexCode" TEXT;

ALTER TABLE "BenchmarkValuationSnapshot"
ADD COLUMN "peSource" TEXT,
ADD COLUMN "peSourceUrl" TEXT,
ADD COLUMN "pbSource" TEXT,
ADD COLUMN "pbSourceUrl" TEXT,
ADD COLUMN "dividendYieldSource" TEXT,
ADD COLUMN "dividendYieldSourceUrl" TEXT;

CREATE TABLE "BenchmarkConstituentSnapshot" (
  "id" TEXT NOT NULL,
  "benchmarkInstrumentId" TEXT NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "coverage" TEXT NOT NULL DEFAULT 'full',
  "totalWeightPercent" DECIMAL(12,8),
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BenchmarkConstituentSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BenchmarkConstituent" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "exchange" TEXT,
  "industry" TEXT,
  "weightPercent" DECIMAL(12,8),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BenchmarkConstituent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BenchmarkConstituentSnapshot_benchmarkInstrumentId_effectiveDate_key" ON "BenchmarkConstituentSnapshot"("benchmarkInstrumentId", "effectiveDate");
CREATE INDEX "BenchmarkConstituentSnapshot_benchmarkInstrumentId_effectiveDate_idx" ON "BenchmarkConstituentSnapshot"("benchmarkInstrumentId", "effectiveDate");
CREATE UNIQUE INDEX "BenchmarkConstituent_snapshotId_code_key" ON "BenchmarkConstituent"("snapshotId", "code");
CREATE INDEX "BenchmarkConstituent_snapshotId_rank_idx" ON "BenchmarkConstituent"("snapshotId", "rank");
CREATE INDEX "BenchmarkConstituent_code_idx" ON "BenchmarkConstituent"("code");

ALTER TABLE "BenchmarkConstituentSnapshot" ADD CONSTRAINT "BenchmarkConstituentSnapshot_benchmarkInstrumentId_fkey" FOREIGN KEY ("benchmarkInstrumentId") REFERENCES "BenchmarkInstrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkConstituent" ADD CONSTRAINT "BenchmarkConstituent_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BenchmarkConstituentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

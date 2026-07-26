ALTER TABLE "BenchmarkInstrument" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered_benchmarks AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS "nextDisplayOrder"
  FROM "BenchmarkInstrument"
)
UPDATE "BenchmarkInstrument"
SET "displayOrder" = ordered_benchmarks."nextDisplayOrder"
FROM ordered_benchmarks
WHERE "BenchmarkInstrument"."id" = ordered_benchmarks."id";

DROP INDEX "BenchmarkInstrument_userId_status_createdAt_idx";
CREATE INDEX "BenchmarkInstrument_userId_status_displayOrder_createdAt_idx" ON "BenchmarkInstrument"("userId", "status", "displayOrder", "createdAt");

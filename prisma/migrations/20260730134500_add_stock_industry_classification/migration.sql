CREATE TABLE "StockIndustryClassification" (
    "code" TEXT NOT NULL,
    "name" TEXT,
    "industry" TEXT,
    "taxonomy" TEXT,
    "source" TEXT,
    "sourceUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockIndustryClassification_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "StockIndustryClassification_status_lastAttemptAt_idx"
ON "StockIndustryClassification"("status", "lastAttemptAt");

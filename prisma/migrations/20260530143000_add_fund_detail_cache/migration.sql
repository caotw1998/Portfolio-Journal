-- CreateTable
CREATE TABLE "FundDetailCache" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3),
    "payloadJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundDetailCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FundDetailCache_assetId_source_section_key" ON "FundDetailCache"("assetId", "source", "section");

-- CreateIndex
CREATE INDEX "FundDetailCache_assetId_section_idx" ON "FundDetailCache"("assetId", "section");

-- CreateIndex
CREATE INDEX "FundDetailCache_expiresAt_idx" ON "FundDetailCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "FundDetailCache" ADD CONSTRAINT "FundDetailCache_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

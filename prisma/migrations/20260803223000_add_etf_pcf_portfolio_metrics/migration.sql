ALTER TABLE "EtfPcfComponent"
ADD COLUMN "referencePrice" DECIMAL(20,8),
ADD COLUMN "referencePriceDate" DATE,
ADD COLUMN "referencePriceSource" TEXT,
ADD COLUMN "referenceValue" DECIMAL(24,4),
ADD COLUMN "basketWeight" DECIMAL(12,8);

CREATE TABLE "EtfPcfSnapshot" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "tradingDay" DATE NOT NULL,
    "previousTradingDay" DATE,
    "creationRedemptionUnit" DECIMAL(24,4),
    "navPerCreationUnit" DECIMAL(24,4),
    "nav" DECIMAL(20,8),
    "cashComponent" DECIMAL(24,4),
    "estimatedCashComponent" DECIMAL(24,4),
    "maxCashRatio" DECIMAL(12,8),
    "creationRedemptionStatus" TEXT,
    "creationRedemptionMechanism" TEXT,
    "publishIopv" BOOLEAN,
    "creationLimit" DECIMAL(24,4),
    "redemptionLimit" DECIMAL(24,4),
    "limitsJson" JSONB,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EtfPcfSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EtfPcfComponent" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "instrumentCode" TEXT NOT NULL,
    "instrumentName" TEXT NOT NULL,
    "quantity" DECIMAL(24,4),
    "substitutionFlag" TEXT NOT NULL,
    "creationPremiumRate" DECIMAL(12,8),
    "redemptionDiscountRate" DECIMAL(12,8),
    "substitutionCashAmount" DECIMAL(24,4),
    "creationCashSubstitute" DECIMAL(24,4),
    "redemptionCashSubstitute" DECIMAL(24,4),
    "market" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EtfPcfComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EtfPcfSnapshot_fundId_tradingDay_key" ON "EtfPcfSnapshot"("fundId", "tradingDay");
CREATE INDEX "EtfPcfSnapshot_fundId_tradingDay_idx" ON "EtfPcfSnapshot"("fundId", "tradingDay");
CREATE UNIQUE INDEX "EtfPcfComponent_snapshotId_instrumentCode_key" ON "EtfPcfComponent"("snapshotId", "instrumentCode");
CREATE INDEX "EtfPcfComponent_snapshotId_idx" ON "EtfPcfComponent"("snapshotId");

ALTER TABLE "EtfPcfSnapshot" ADD CONSTRAINT "EtfPcfSnapshot_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EtfPcfComponent" ADD CONSTRAINT "EtfPcfComponent_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "EtfPcfSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

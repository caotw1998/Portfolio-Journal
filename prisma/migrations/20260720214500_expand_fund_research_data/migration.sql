ALTER TABLE "Fund"
ADD COLUMN "fullName" TEXT,
ADD COLUMN "custodian" TEXT,
ADD COLUMN "issueDate" DATE,
ADD COLUMN "establishedShares" DECIMAL(24,4),
ADD COLUMN "managementFeeRate" DECIMAL(12,8),
ADD COLUMN "custodianFeeRate" DECIMAL(12,8),
ADD COLUMN "salesServiceFeeRate" DECIMAL(12,8),
ADD COLUMN "trackingTarget" TEXT,
ADD COLUMN "investmentObjective" TEXT,
ADD COLUMN "investmentScope" TEXT,
ADD COLUMN "investmentStrategy" TEXT,
ADD COLUMN "dividendPolicy" TEXT,
ADD COLUMN "riskReturnCharacteristics" TEXT;

ALTER TABLE "FundHolding"
ADD COLUMN "quantity" DECIMAL(24,4);

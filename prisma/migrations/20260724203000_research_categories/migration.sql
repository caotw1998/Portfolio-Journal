ALTER TABLE "User"
ADD COLUMN "researchCategoriesInitialized" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ResearchCategory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResearchCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserFundCategory" (
  "userFundId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserFundCategory_pkey" PRIMARY KEY ("userFundId", "categoryId")
);

CREATE UNIQUE INDEX "ResearchCategory_userId_name_key" ON "ResearchCategory"("userId", "name");
CREATE INDEX "ResearchCategory_userId_sortOrder_idx" ON "ResearchCategory"("userId", "sortOrder");
CREATE INDEX "UserFundCategory_categoryId_idx" ON "UserFundCategory"("categoryId");

ALTER TABLE "ResearchCategory"
ADD CONSTRAINT "ResearchCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserFundCategory"
ADD CONSTRAINT "UserFundCategory_userFundId_fkey" FOREIGN KEY ("userFundId") REFERENCES "UserFund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserFundCategory"
ADD CONSTRAINT "UserFundCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ResearchCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ResearchCategory" ("id", "userId", "name", "sortOrder", "createdAt", "updatedAt")
SELECT
  'rcat_' || md5("User"."id" || ':' || defaults."name"),
  "User"."id",
  defaults."name",
  defaults."sortOrder",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
CROSS JOIN (VALUES ('A股', 0), ('港股', 1), ('海外资产', 2)) AS defaults("name", "sortOrder");

UPDATE "User" SET "researchCategoriesInitialized" = true;

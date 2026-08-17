CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "force" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncJobItem" (
    "id" TEXT NOT NULL,
    "syncJobId" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fundId" TEXT,
    "benchmarkInstrumentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJobItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncJobItem_syncJobId_resourceKey_key" ON "SyncJobItem"("syncJobId", "resourceKey");
CREATE INDEX "SyncJob_userId_status_createdAt_idx" ON "SyncJob"("userId", "status", "createdAt");
CREATE INDEX "SyncJob_status_createdAt_idx" ON "SyncJob"("status", "createdAt");
CREATE INDEX "SyncJobItem_syncJobId_status_kind_idx" ON "SyncJobItem"("syncJobId", "status", "kind");
CREATE INDEX "SyncJobItem_status_leaseExpiresAt_idx" ON "SyncJobItem"("status", "leaseExpiresAt");

ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncJobItem" ADD CONSTRAINT "SyncJobItem_syncJobId_fkey" FOREIGN KEY ("syncJobId") REFERENCES "SyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncJobItem" ADD CONSTRAINT "SyncJobItem_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncJobItem" ADD CONSTRAINT "SyncJobItem_benchmarkInstrumentId_fkey" FOREIGN KEY ("benchmarkInstrumentId") REFERENCES "BenchmarkInstrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

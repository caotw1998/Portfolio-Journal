import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createOrReuseAllDataSyncJob, createOrReuseForcedFundsSyncJob, getSyncJob, isWorkerTokenValid, processNextSyncJobBatch } from "@/lib/domain/sync-jobs";
import { createUniqueEmail, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("persistent all-data sync jobs", () => {
  test("reuses an active job and reports actual fund/index progress", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("sync-job"), passwordHash: "test" } });
    const fund = await prisma.fund.create({ data: { code: "110022", name: "易方达消费行业股票", market: "CN_FUND" } });
    await prisma.userFund.create({ data: { userId: user.id, fundId: fund.id } });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.fundSourceSnapshot.createMany({ data: ["nav", "profile", "managers", "portfolio", "scale", "flows", "holders"].map((section) => ({
      fundId: fund.id,
      source: "eastmoney",
      section,
      rawJson: {},
      expiresAt,
    })) });
    await prisma.benchmarkInstrument.create({ data: { userId: user.id, code: "MANUAL", market: "GLOBAL", name: "手动指数", provider: "manual" } });

    const created = await createOrReuseAllDataSyncJob(user.id);
    const reused = await createOrReuseAllDataSyncJob(user.id);
    expect(reused.reused).toBe(true);
    expect(reused.job.id).toBe(created.job.id);
    expect(created.job.summary).toMatchObject({ total: 2, queued: 1, skipped: 1, settled: 1, percentage: 50 });

    await expect(processNextSyncJobBatch()).resolves.toMatchObject({ processed: 1, jobId: created.job.id });
    await expect(getSyncJob(user.id, created.job.id)).resolves.toMatchObject({
      status: "completed",
      summary: { total: 2, completed: 1, skipped: 1, failed: 0, settled: 2, percentage: 100 },
    });
  });

  test("settles an all-skipped job instead of leaving it queued", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("sync-job-skipped"), passwordHash: "test" } });
    await prisma.benchmarkInstrument.create({ data: { userId: user.id, code: "MANUAL", market: "GLOBAL", name: "手动指数", provider: "manual" } });
    const created = await createOrReuseAllDataSyncJob(user.id);

    await expect(processNextSyncJobBatch()).resolves.toMatchObject({ processed: 0, jobId: created.job.id });
    await expect(getSyncJob(user.id, created.job.id)).resolves.toMatchObject({ status: "completed", summary: { total: 1, skipped: 1, percentage: 100 } });
  });

  test("creates a reusable forced refresh job containing funds only", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("sync-job-forced-funds"), passwordHash: "test" } });
    const fund = await prisma.fund.create({ data: { code: "510050", name: "上证50ETF", market: "CN_FUND" } });
    await prisma.userFund.create({ data: { userId: user.id, fundId: fund.id } });
    await prisma.benchmarkInstrument.create({ data: { userId: user.id, code: "000300", market: "CN", name: "沪深300", provider: "public_market" } });

    const created = await createOrReuseForcedFundsSyncJob(user.id);
    const reused = await createOrReuseForcedFundsSyncJob(user.id);

    expect(reused).toMatchObject({ reused: true, job: { id: created.job.id } });
    expect(created.job).toMatchObject({
      scope: "all_funds",
      force: true,
      summary: { total: 1, funds: { total: 1, queued: 1 }, benchmarks: { total: 0 } },
    });
  });

  test("accepts only the configured worker token", () => {
    const previous = process.env.SYNC_WORKER_TOKEN;
    process.env.SYNC_WORKER_TOKEN = "a".repeat(32);
    expect(isWorkerTokenValid("a".repeat(32))).toBe(true);
    expect(isWorkerTokenValid("b".repeat(32))).toBe(false);
    expect(isWorkerTokenValid(null)).toBe(false);
    if (previous === undefined) delete process.env.SYNC_WORKER_TOKEN;
    else process.env.SYNC_WORKER_TOKEN = previous;
  });
});

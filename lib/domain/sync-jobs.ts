import { ApiError } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { syncBenchmarkHistory } from "@/lib/domain/benchmarks";
import { syncFund } from "@/lib/funds/service";

const SYNC_SCOPE_ALL_DATA = "all_data";
const SYNC_SCOPE_ALL_FUNDS = "all_funds";
const FUND_KIND = "fund";
const BENCHMARK_KIND = "benchmark";
const FUND_CONCURRENCY = 4;
const BENCHMARK_CONCURRENCY = 2;
const ITEM_LEASE_MS = 15 * 60 * 1000;

function itemSummary(items: Array<{ status: string }>) {
  const summary = { total: items.length, completed: 0, skipped: 0, failed: 0, running: 0, queued: 0 };
  for (const item of items) {
    if (item.status === "completed") summary.completed += 1;
    else if (item.status === "skipped") summary.skipped += 1;
    else if (item.status === "failed") summary.failed += 1;
    else if (item.status === "running") summary.running += 1;
    else summary.queued += 1;
  }
  return summary;
}

function summarizeByKind(items: Array<{ kind: string; status: string }>, kind: string) {
  return itemSummary(items.filter((item) => item.kind === kind));
}

function serializeJob(job: {
  id: string;
  scope: string;
  force: boolean;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  items: Array<{
    kind: string;
    status: string;
    error: string | null;
    startedAt: Date | null;
    fund: { code: string; name: string | null } | null;
    benchmarkInstrument: { code: string; name: string } | null;
  }>;
}) {
  const summary = itemSummary(job.items);
  const current = job.items.find((item) => item.status === "running") ?? null;
  const currentName = current?.fund
    ? current.fund.name ?? current.fund.code
    : current?.benchmarkInstrument?.name ?? current?.benchmarkInstrument?.code ?? null;
  return {
    id: job.id,
    scope: job.scope,
    force: job.force,
    status: job.status,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    summary: {
      ...summary,
      settled: summary.completed + summary.skipped + summary.failed,
      percentage: summary.total ? Math.round((summary.completed + summary.skipped + summary.failed) / summary.total * 100) : 100,
      funds: summarizeByKind(job.items, FUND_KIND),
      benchmarks: summarizeByKind(job.items, BENCHMARK_KIND),
    },
    current: current ? { kind: current.kind, name: currentName, startedAt: current.startedAt?.toISOString() ?? null } : null,
    failures: job.items.filter((item) => item.status === "failed").map((item) => ({
      kind: item.kind,
      name: item.fund?.name ?? item.fund?.code ?? item.benchmarkInstrument?.name ?? item.benchmarkInstrument?.code ?? "未知项目",
      error: item.error,
    })),
  };
}

async function readJob(userId: string, jobId: string) {
  const job = await prisma.syncJob.findFirst({
    where: { id: jobId, userId },
    include: {
      items: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: {
          fund: { select: { code: true, name: true } },
          benchmarkInstrument: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!job) throw new ApiError("同步任务不存在。", 404);
  return job;
}

async function createOrReuseSyncJob(
  userId: string,
  { scope, force, includeBenchmarks }: { scope: string; force: boolean; includeBenchmarks: boolean },
) {
  const existing = await prisma.syncJob.findFirst({
    where: { userId, scope, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) return { job: serializeJob(await readJob(userId, existing.id)), reused: true };

  const [funds, benchmarks] = await Promise.all([
    prisma.userFund.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { fundId: true } }),
    includeBenchmarks
      ? prisma.benchmarkInstrument.findMany({ where: { userId }, orderBy: { displayOrder: "asc" }, select: { id: true, provider: true } })
      : Promise.resolve([]),
  ]);
  const job = await prisma.syncJob.create({
    data: {
      userId,
      scope,
      force,
      items: {
        create: [
          ...funds.map((fund) => ({ resourceKey: `${FUND_KIND}:${fund.fundId}`, kind: FUND_KIND, fundId: fund.fundId })),
          ...benchmarks.map((benchmark) => ({
            resourceKey: `${BENCHMARK_KIND}:${benchmark.id}`,
            kind: BENCHMARK_KIND,
            benchmarkInstrumentId: benchmark.id,
            status: benchmark.provider === "manual" ? "skipped" : "queued",
            completedAt: benchmark.provider === "manual" ? new Date() : undefined,
          })),
        ],
      },
    },
    select: { id: true },
  });
  return { job: serializeJob(await readJob(userId, job.id)), reused: false };
}

export async function createOrReuseAllDataSyncJob(userId: string, force = false) {
  return createOrReuseSyncJob(userId, {
    scope: SYNC_SCOPE_ALL_DATA,
    force,
    includeBenchmarks: true,
  });
}

export async function createOrReuseForcedFundsSyncJob(userId: string) {
  return createOrReuseSyncJob(userId, {
    scope: SYNC_SCOPE_ALL_FUNDS,
    force: true,
    includeBenchmarks: false,
  });
}

export async function getSyncJob(userId: string, jobId: string) {
  return serializeJob(await readJob(userId, jobId));
}

async function reclaimExpiredItems() {
  const now = new Date();
  await prisma.syncJobItem.updateMany({
    where: { status: "running", leaseExpiresAt: { lte: now } },
    data: { status: "queued", leaseExpiresAt: null },
  });
}

async function claimItems(syncJobId: string, kind: string, take: number) {
  const candidates = await prisma.syncJobItem.findMany({
    where: { syncJobId, kind, status: "queued" },
    orderBy: { createdAt: "asc" },
    take,
  });
  const leaseExpiresAt = new Date(Date.now() + ITEM_LEASE_MS);
  const claimed = await Promise.all(candidates.map(async (item) => {
    const updated = await prisma.syncJobItem.updateMany({
      where: { id: item.id, status: "queued" },
      data: { status: "running", attemptCount: { increment: 1 }, startedAt: new Date(), leaseExpiresAt },
    });
    return updated.count === 1 ? item : null;
  }));
  return claimed.filter((item): item is (typeof candidates)[number] => item !== null);
}

async function settleItem(syncJob: { userId: string; force: boolean }, item: { id: string; kind: string; fundId: string | null; benchmarkInstrumentId: string | null }) {
  try {
    if (item.kind === FUND_KIND && item.fundId) {
      await syncFund(syncJob.userId, item.fundId, syncJob.force);
    } else if (item.kind === BENCHMARK_KIND && item.benchmarkInstrumentId) {
      await syncBenchmarkHistory(syncJob.userId, item.benchmarkInstrumentId, fetch, { force: syncJob.force });
    } else {
      throw new Error("同步任务缺少目标资源。");
    }
    await prisma.syncJobItem.update({ where: { id: item.id }, data: { status: "completed", error: null, completedAt: new Date(), leaseExpiresAt: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败。";
    await prisma.syncJobItem.update({ where: { id: item.id }, data: { status: "failed", error: message, completedAt: new Date(), leaseExpiresAt: null } });
  }
}

async function settleJobStatus(syncJobId: string) {
  const items = await prisma.syncJobItem.findMany({ where: { syncJobId }, select: { status: true } });
  const summary = itemSummary(items);
  if (summary.queued || summary.running) return;
  await prisma.syncJob.update({
    where: { id: syncJobId },
    data: { status: summary.failed ? "partial" : "completed", completedAt: new Date() },
  });
}

export async function processNextSyncJobBatch() {
  await reclaimExpiredItems();
  const job = await prisma.syncJob.findFirst({
    where: { status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, force: true, startedAt: true },
  });
  if (!job) return { processed: 0, jobId: null };

  await prisma.syncJob.update({ where: { id: job.id }, data: { status: "running", startedAt: job.startedAt ?? new Date() } });
  const [funds, benchmarks] = await Promise.all([
    claimItems(job.id, FUND_KIND, FUND_CONCURRENCY),
    claimItems(job.id, BENCHMARK_KIND, BENCHMARK_CONCURRENCY),
  ]);
  const items = [...funds, ...benchmarks];
  await Promise.all(items.map((item) => settleItem(job, item)));
  await settleJobStatus(job.id);
  return { processed: items.length, jobId: job.id };
}

export function isWorkerTokenValid(value: string | null) {
  const token = process.env.SYNC_WORKER_TOKEN;
  if (!token || !value || token.length !== value.length) return false;
  let mismatch = 0;
  for (let index = 0; index < token.length; index += 1) mismatch |= token.charCodeAt(index) ^ value.charCodeAt(index);
  return mismatch === 0;
}

import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createBenchmark,
  syncBenchmarkHistory,
  updateBenchmark,
} from "@/lib/domain/benchmarks";
import { createUniqueEmail, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("benchmark search persistence and sync", () => {
  test("stores a searched source symbol and clears it when the code changes manually", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-search"), passwordHash: "test" } });
    const created = await createBenchmark(user.id, { code: "SPX", market: "GLOBAL", name: "标普500", sourceSymbol: "100.SPX" });
    expect(created.sourceSymbol).toBe("100.SPX");

    const renamed = await updateBenchmark(user.id, created.id, { code: "SPX", market: "GLOBAL", name: "标普500指数" });
    expect(renamed.sourceSymbol).toBe("100.SPX");

    const changed = await updateBenchmark(user.id, created.id, { code: "NDX" });
    expect(changed.sourceSymbol).toBeNull();
  });

  test("treats legacy CN and searched SH/SZ markets as the same instrument identity", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-duplicate"), passwordHash: "test" } });
    const legacy = await createBenchmark(user.id, { code: "000300", market: "CN", name: "沪深300" });
    await expect(createBenchmark(user.id, { code: "000300", market: "SH", name: "沪深300", sourceSymbol: "1.000300" })).rejects.toMatchObject({ status: 409 });

    const second = await createBenchmark(user.id, { code: "000905", market: "CN", name: "中证500" });
    await expect(updateBenchmark(user.id, second.id, { code: "000300", market: "SZ" })).rejects.toMatchObject({ status: 409 });
    await expect(prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: legacy.id } })).resolves.toMatchObject({ code: "000300", market: "CN" });
  });

  test("syncs with the exact public source symbol", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-sync"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "SPX", market: "GLOBAL", name: "标普500", sourceSymbol: "100.SPX" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("secid")).toBe("100.SPX");
      return Response.json({ data: { klines: ["2026-07-23,0,6380.10", "2026-07-24,0,6412.45"] } });
    });

    await syncBenchmarkHistory(user.id, benchmark.id, fetchMock);
    const stored = await prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id }, include: { priceSnapshots: { orderBy: { date: "asc" } } } });
    expect(stored.status).toBe("active");
    expect(stored.lastSyncError).toBeNull();
    expect(stored.priceSnapshots.map((point) => point.closeValue.toNumber())).toEqual([6380.1, 6412.45]);
  });

  test("keeps the instrument and records a retryable sync error", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-error"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "SPX", market: "GLOBAL", name: "标普500", sourceSymbol: "100.SPX" });
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));

    await expect(syncBenchmarkHistory(user.id, benchmark.id, fetchMock)).rejects.toBeInstanceOf(Error);
    await expect(prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id } })).resolves.toMatchObject({ status: "sync_error", lastSyncError: expect.any(String) });
  });
});

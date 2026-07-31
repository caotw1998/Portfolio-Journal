import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createBenchmark,
  getBenchmarkDetail,
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

  test("does not substitute the ETF proxy for the official S&P total-return variant", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-total-return"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "SPCLLHCT", market: "GLOBAL", name: "标普中国A股大盘红利低波50全收益指数", sourceSymbol: "^SPCLLHCT" });
    const fetchMock = vi.fn(async () => Response.json({ chart: { result: [{ timestamp: [1785312444], indicators: { quote: [{ close: [7607.1] }] } }] } }));

    await expect(syncBenchmarkHistory(user.id, benchmark.id, fetchMock)).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id } })).resolves.toMatchObject({ status: "sync_error" });
  });

  test("drops the isolated CSI 1990 placeholder during sync", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-placeholder"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "H00922", market: "CN", name: "中证红利全收益", sourceSymbol: "1.H00922" });
    const fetchMock = vi.fn(async () => Response.json({ data: { klines: ["1990-01-01,0,1000", "2004-12-31,0,1000", "2005-01-04,0,981.56"] } }));

    await syncBenchmarkHistory(user.id, benchmark.id, fetchMock);
    const points = await prisma.benchmarkPriceSnapshot.findMany({ where: { benchmarkInstrumentId: benchmark.id }, orderBy: { date: "asc" } });
    expect(points.map((point) => point.date.toISOString().slice(0, 10))).toEqual(["2004-12-31", "2005-01-04"]);
  });

  test("falls back to a clearly tagged ETF proxy when the exact S&P history has one point", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-short-history"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "SPCLLHCP", market: "GLOBAL", name: "标普中国A股大盘红利低波50指数", sourceSymbol: "^SPCLLHCP" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes("query1.finance.yahoo.com")
      ? Response.json({ chart: { result: [{ timestamp: [1785312444], indicators: { quote: [{ close: [3759.55] }] } }] } })
      : Response.json({ data: { klines: ["2026-07-23,0,1.201", "2026-07-24,0,1.215"] } }));

    await syncBenchmarkHistory(user.id, benchmark.id, fetchMock);
    const stored = await prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id }, include: { priceSnapshots: { orderBy: { date: "asc" } } } });
    expect(stored.status).toBe("active");
    expect(stored.priceSnapshots.map((point) => point.source)).toEqual(["proxy_etf_515450", "proxy_etf_515450"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(getBenchmarkDetail(user.id, benchmark.id)).resolves.toMatchObject({ dataBasis: "proxy_etf", dataBasisLabel: "515450 ETF 代理", pointCount: 2 });
  });

  test("uses Sina ETF history when Eastmoney closes the proxy request", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-proxy-provider-fallback"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "SPCLLHCP", market: "GLOBAL", name: "标普中国A股大盘红利低波50指数", sourceSymbol: "^SPCLLHCP" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("query1.finance.yahoo.com")) throw new TypeError("fetch failed");
      if (url.includes("push2his.eastmoney.com")) throw new TypeError("fetch failed");
      return Response.json([
        { day: "2026-07-23", close: "1.201" },
        { day: "2026-07-24", close: "1.215" },
      ]);
    });

    await syncBenchmarkHistory(user.id, benchmark.id, fetchMock);
    const stored = await prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id }, include: { priceSnapshots: { orderBy: { date: "asc" } } } });
    expect(stored.status).toBe("active");
    expect(stored.priceSnapshots.map((point) => point.closeValue.toNumber())).toEqual([1.201, 1.215]);
    expect(stored.priceSnapshots.map((point) => point.source)).toEqual(["proxy_etf_515450", "proxy_etf_515450"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

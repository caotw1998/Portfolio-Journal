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

  test("updates only the overlapping history window after the first sync", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-incremental"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "SPX", market: "GLOBAL", name: "标普500", sourceSymbol: "100.SPX" });
    const firstFetch = vi.fn(async () => Response.json({ data: { klines: [
      "2026-06-30,0,6200.00",
      "2026-08-03,0,6400.00",
    ] } }));

    await syncBenchmarkHistory(user.id, benchmark.id, firstFetch);

    const incrementalFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("beg")).toBe("20260703");
      return Response.json({ data: { klines: [
        "2026-07-03,0,6220.00",
        "2026-08-03,0,6410.00",
        "2026-08-04,0,6425.00",
      ] } });
    });

    await syncBenchmarkHistory(user.id, benchmark.id, incrementalFetch);

    const stored = await prisma.benchmarkPriceSnapshot.findMany({ where: { benchmarkInstrumentId: benchmark.id }, orderBy: { date: "asc" } });
    expect(stored.map((point) => [point.date.toISOString().slice(0, 10), point.closeValue.toNumber()])).toEqual([
      ["2026-06-30", 6200],
      ["2026-07-03", 6220],
      ["2026-08-03", 6410],
      ["2026-08-04", 6425],
    ]);
  });

  test("stores official CSI valuation history and current disclosed fields", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-valuation"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "000300", market: "CN", name: "沪深300指数" });
    const valuationDates = Array.from({ length: 20 }, (_, index) => new Date(Date.UTC(2026, 6, 15 + index)).toISOString().slice(0, 10).replaceAll("-", ""));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/index-perf")) return Response.json({ data: [
        { tradeDate: "20260802", close: 4100 },
        { tradeDate: "20260803", close: 4120 },
      ] });
      if (url.pathname.endsWith("/indexCsiDsPe")) return Response.json({ code: "200", success: true, data: valuationDates.map((tradeDate, index) => ({ tradeDate, peg: 13 + index / 10 })) });
      if (url.pathname.endsWith("/indexValuation")) return Response.json({ code: "200", success: true, data: { tradeDate: "20260803", indexValuations: [
        { indexName: "沪深300", peg: 14.23, pb: 1.4, dp: 2.55 },
      ] } });
      if (url.pathname.includes("/index/weight/top10new/")) return Response.json({ code: "200", success: true, data: { updateDate: "2026-08-03", top10Sum: 31.25, weightList: [
        { rowNum: "1", securityCode: "600519", securityName: "贵州茅台", marketNameCn: "上海证券交易所", csiTypeL1: "主要消费", preciseWeight: 5.21 },
      ] } });
      return new Response("not found", { status: 404 });
    });

    await syncBenchmarkHistory(user.id, benchmark.id, fetchMock);
    const stored = await prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id }, include: { valuationSnapshots: { orderBy: { date: "asc" } }, constituentSnapshots: { include: { constituents: true } } } });
    expect(stored.status).toBe("active");
    expect(stored.valuationLastSyncError).toBeNull();
    expect(stored.valuationSnapshots).toHaveLength(20);
    expect(stored.valuationSnapshots.at(-1)).toMatchObject({ source: "csindex" });
    expect(stored.valuationSnapshots.at(-1)?.peTtm?.toNumber()).toBe(14.23);
    expect(stored.valuationSnapshots.at(-1)?.pb?.toNumber()).toBe(1.4);
    expect(stored.valuationSnapshots.at(-1)?.dividendYield?.toNumber()).toBe(2.55);
    expect(stored.valuationSnapshots.at(-1)).toMatchObject({ peSource: "csindex", pbSource: "csindex", dividendYieldSource: "csindex" });
    expect(stored.constituentLastSyncError).toBeNull();
    expect(stored.constituentSnapshots[0]?.coverage).toBe("top10");
    expect(stored.constituentSnapshots[0]?.constituents[0]).toMatchObject({ code: "600519", name: "贵州茅台" });
  });

  test("does not fail price sync when optional valuation endpoints fail", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-valuation-error"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "000300", market: "CN", name: "沪深300指数" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/index-perf")) return Response.json({ data: [
        { tradeDate: "20260802", close: 4100 },
        { tradeDate: "20260803", close: 4120 },
      ] });
      return new Response("unavailable", { status: 503 });
    });

    await syncBenchmarkHistory(user.id, benchmark.id, fetchMock);
    await expect(prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id } })).resolves.toMatchObject({
      status: "active",
      lastSyncError: null,
      valuationLastSyncError: expect.stringContaining("中证估值同步失败"),
    });
  });

  test("keeps the instrument and records a retryable sync error", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-error"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "SPX", market: "GLOBAL", name: "标普500", sourceSymbol: "100.SPX" });
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));

    await expect(syncBenchmarkHistory(user.id, benchmark.id, fetchMock)).rejects.toBeInstanceOf(Error);
    await expect(prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id } })).resolves.toMatchObject({ status: "sync_error", lastSyncError: expect.any(String) });
  });

  test.each([
    { code: "399296", market: "CN", name: "创业板成长", sourceSymbol: undefined },
    { code: "399372", market: "SZ", name: "大盘成长", sourceSymbol: "0.399372" },
  ])("syncs $code from the official CNI full-history endpoint", async ({ code, market, name, sourceSymbol }) => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail(`benchmark-cni-${code}`), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code, market, name, sourceSymbol });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe("www.cnindex.com.cn");
      expect(url.pathname).toBe("/market/market/getIndexDailyDataWithDataFormat");
      expect(url.searchParams.get("indexCode")).toBe(code);
      expect(url.searchParams.get("startDate")).toBe("1990-01-01");
      expect(url.searchParams.get("frequency")).toBe("day");
      return Response.json({
        code: 200,
        data: {
          data: [
            ["2026-07-24", 6380.1, 6450, 6420, 6370, 6412.45],
            ["invalid", 6380.1, 6450, 6420, 6370, 9999],
            ["2026-07-23", 6350, 6400, 6380, 6320, 6380.1],
          ],
        },
      });
    });

    await syncBenchmarkHistory(user.id, benchmark.id, fetchMock);

    const stored = await prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id }, include: { priceSnapshots: { orderBy: { date: "asc" } } } });
    expect(stored.status).toBe("active");
    expect(stored.lastSyncError).toBeNull();
    expect(stored.priceSnapshots.map((point) => point.date.toISOString().slice(0, 10))).toEqual(["2026-07-23", "2026-07-24"]);
    expect(stored.priceSnapshots.map((point) => point.closeValue.toNumber())).toEqual([6380.1, 6412.45]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("falls back to the exact Eastmoney symbol when CNI is unavailable", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-cni-fallback"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "399372", market: "SZ", name: "大盘成长", sourceSymbol: "0.399372" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "www.cnindex.com.cn") throw new TypeError("fetch failed");
      expect(url.hostname).toBe("push2his.eastmoney.com");
      expect(url.searchParams.get("secid")).toBe("0.399372");
      return Response.json({ data: { klines: ["2026-07-23,0,6380.10", "2026-07-24,0,6412.45"] } });
    });

    await syncBenchmarkHistory(user.id, benchmark.id, fetchMock);

    await expect(prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id } })).resolves.toMatchObject({ status: "active", lastSyncError: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("preserves stored history and records readable provider errors when both CNI and Eastmoney fail", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("benchmark-cni-errors"), passwordHash: "test" } });
    const benchmark = await createBenchmark(user.id, { code: "399296", market: "CN", name: "创业板成长" });
    await prisma.benchmarkPriceSnapshot.create({ data: { benchmarkInstrumentId: benchmark.id, date: new Date("2026-07-23T00:00:00Z"), closeValue: 6380.1, source: "public_market" } });
    const fetchMock = vi.fn(async () => { throw new TypeError("fetch failed"); });

    await expect(syncBenchmarkHistory(user.id, benchmark.id, fetchMock)).rejects.toThrow("国证指数同步失败（连接失败）；东方财富备用同步失败（连接失败）。");

    const stored = await prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmark.id }, include: { priceSnapshots: true } });
    expect(stored.status).toBe("sync_error");
    expect(stored.lastSyncError).toBe("国证指数同步失败（连接失败）；东方财富备用同步失败（连接失败）。");
    expect(stored.priceSnapshots).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

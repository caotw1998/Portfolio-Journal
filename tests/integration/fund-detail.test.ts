import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { enrichFundPortfolioReportIndustries, getEtfPcfSnapshot, getFundDetail, getFundPortfolioReport, searchFunds, syncFund } from "@/lib/funds/service";
import { createUniqueEmail, resetDatabase } from "./helpers";

describe("fund detail service", () => {
  beforeEach(resetDatabase);
  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });

  test("normalizes legacy cached ETF markets in search results", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.fundCatalogEntry.createMany({ data: [
      { code: "515450", name: "红利低波50ETF南方", market: "CN_FUND", rawType: "指数型-股票", source: "eastmoney" },
      { code: "007466", name: "华泰柏瑞中证红利低波ETF联接A", market: "CN_FUND", rawType: "指数型-股票", source: "eastmoney" },
    ] });
    await expect(searchFunds("515450")).resolves.toEqual([expect.objectContaining({ code: "515450", market: "SSE" })]);
    await expect(searchFunds("007466")).resolves.toEqual([expect.objectContaining({ code: "007466", market: "CN_FUND" })]);
  });

  test("returns report summaries and loads one report's holdings on demand", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const user = await prisma.user.create({ data: { email: createUniqueEmail("detail"), passwordHash: "test" } });
    const fund = await prisma.fund.create({
      data: {
        code: "110022",
        market: "CN_FUND",
        name: "测试基金",
        followers: { create: { userId: user.id } },
        portfolioReports: {
          create: Array.from({ length: 6 }, (_, index) => ({
            reportDate: new Date(Date.UTC(2025, index, 1)),
            source: "test",
            holdings: { create: { kind: "stock", rank: 1, code: "000001", name: `持仓${index + 1}`, weight: index + 1, quantity: index + 1 } },
          })),
        },
      },
    });

    const detail = await getFundDetail(user.id, fund.id);
    expect(detail.portfolioReports).toHaveLength(6);
    const report = await getFundPortfolioReport(user.id, fund.id, detail.portfolioReports[0]?.id);
    expect(report.holdings[0]?.quantity).toBe(6);
    expect(report.previousReportDate?.slice(0, 10)).toBe("2025-05-01");
    expect(report.previousHoldings[0]?.weight).toBe(5);
  });

  test("caches a report's stock industries and returns them with holdings", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const user = await prisma.user.create({ data: { email: createUniqueEmail("holding-industry"), passwordHash: "test" } });
    const fund = await prisma.fund.create({ data: { code: "000390", market: "CN_FUND", followers: { create: { userId: user.id } }, portfolioReports: { create: { reportDate: new Date("2026-06-30T00:00:00Z"), source: "test", holdings: { create: { kind: "stock", rank: 1, code: "300502", name: "新易盛", weight: 8.2 } } } } } });
    const report = await prisma.fundPortfolioReport.findFirstOrThrow({ where: { fundId: fund.id } });
    const fetchMock = vi.fn(async () => Response.json({ data: [{ securityCode: "300502", cics1stName: "信息技术" }] }));
    await enrichFundPortfolioReportIndustries(user.id, fund.id, report.id, fetchMock);
    const selected = await getFundPortfolioReport(user.id, fund.id, report.id);
    expect(selected.holdings[0]).toMatchObject({ code: "300502", industry: "信息技术", industrySource: "csindex" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await enrichFundPortfolioReportIndustries(user.id, fund.id, report.id, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await prisma.stockIndustryClassification.update({ where: { code: "300502" }, data: { industry: "通信设备", source: "eastmoney", taxonomy: "东方财富行业" } });
    await enrichFundPortfolioReportIndustries(user.id, fund.id, report.id, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("returns all capital history in chronological order including individual holders", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const user = await prisma.user.create({ data: { email: createUniqueEmail("capital-history"), passwordHash: "test" } });
    const fund = await prisma.fund.create({
      data: {
        code: "000390",
        market: "CN_FUND",
        followers: { create: { userId: user.id } },
        scaleSnapshots: { create: [
          { reportDate: new Date("2026-06-30T00:00:00Z"), netAssets: 161.07, source: "test" },
          { reportDate: new Date("2014-06-30T00:00:00Z"), netAssets: 7.5, source: "test" },
        ] },
        flowSnapshots: { create: [
          { reportDate: new Date("2026-06-30T00:00:00Z"), subscriptions: 21.03, redemptions: 14.12, totalShares: 44.83, source: "test" },
          { reportDate: new Date("2014-06-30T00:00:00Z"), subscriptions: 0.2, redemptions: 0.1, totalShares: 5.96, source: "test" },
        ] },
        holderSnapshots: { create: [
          { reportDate: new Date("2025-12-31T00:00:00Z"), institutionPercent: 35.63, individualPercent: 64.37, internalPercent: 0.02, source: "test" },
          { reportDate: new Date("2014-06-30T00:00:00Z"), institutionPercent: 81, individualPercent: 19, internalPercent: 0.02, source: "test" },
        ] },
      },
    });

    const detail = await getFundDetail(user.id, fund.id);
    expect(detail.scaleSnapshots.map((point) => point.reportDate.slice(0, 10))).toEqual(["2014-06-30", "2026-06-30"]);
    expect(detail.flowSnapshots).toHaveLength(2);
    expect(detail.holderSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ reportDate: "2014-06-30T00:00:00.000Z", individualPercent: 19 }),
      expect.objectContaining({ reportDate: "2025-12-31T00:00:00.000Z", individualPercent: 64.37 }),
    ]));
  });

  test("returns ETF PCF date summaries and loads one component basket on demand", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const user = await prisma.user.create({ data: { email: createUniqueEmail("etf-pcf"), passwordHash: "test" } });
    const fund = await prisma.fund.create({ data: {
      code: "510300",
      market: "SSE",
      vehicleType: "ETF",
      followers: { create: { userId: user.id } },
      etfPcfSnapshots: { create: [
        { tradingDay: new Date("2026-07-28T00:00:00Z"), creationRedemptionUnit: 900000, source: "official_exchange", components: { create: { instrumentCode: "600519", instrumentName: "贵州茅台", quantity: 100, substitutionFlag: "1" } } },
        { tradingDay: new Date("2026-07-27T00:00:00Z"), creationRedemptionUnit: 900000, source: "official_exchange", components: { create: { instrumentCode: "000001", instrumentName: "平安银行", quantity: 1600, substitutionFlag: "1" } } },
      ] },
    } });

    const detail = await getFundDetail(user.id, fund.id);
    expect(detail.etfPcfSnapshots.map((snapshot) => snapshot.tradingDay.slice(0, 10))).toEqual(["2026-07-28", "2026-07-27"]);
    expect(detail.etfPcfSnapshots[0]).not.toHaveProperty("components");
    const snapshot = await getEtfPcfSnapshot(user.id, fund.id, detail.etfPcfSnapshots[1]?.id);
    expect(snapshot?.components).toEqual([expect.objectContaining({ instrumentCode: "000001", quantity: 1600 })]);
  });

  test("repairs a legacy ETF identity before deciding whether to sync PCF", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const user = await prisma.user.create({ data: { email: createUniqueEmail("legacy-etf-pcf"), passwordHash: "test" } });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const fund = await prisma.fund.create({ data: {
      code: "515450",
      name: "红利低波50ETF南方",
      rawType: "指数型-股票",
      type: "equity",
      market: "CN_FUND",
      vehicleType: "ETF",
      followers: { create: { userId: user.id } },
      sourceSnapshots: { create: ["nav", "profile", "managers", "portfolio", "scale", "flows", "holders"].map((section) => ({ source: "eastmoney", section, rawJson: {}, expiresAt })) },
    } });
    const xml = `<?xml version="1.0"?><SSEPortfolioCompositionFile><FundInstrumentID>515450</FundInstrumentID><TradingDay>20260730</TradingDay><CreationRedemptionUnit>1000000</CreationRedemptionUnit><ComponentList><Component><InstrumentID>600519</InstrumentID><InstrumentName>贵州茅台</InstrumentName><Quantity>100</Quantity><SubstitutionFlag>1</SubstitutionFlag></Component></ComponentList></SSEPortfolioCompositionFile>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { status: 200 })));

    await syncFund(user.id, fund.id);

    await expect(prisma.fund.findUniqueOrThrow({ where: { id: fund.id } })).resolves.toMatchObject({ market: "SSE", vehicleType: "ETF" });
    await expect(prisma.etfPcfSnapshot.findFirstOrThrow({ where: { fundId: fund.id }, include: { components: true } })).resolves.toMatchObject({ components: [expect.objectContaining({ instrumentCode: "600519" })] });
  });

  test("preserves the last valid NAV archive when a paginated refresh fails midway", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const user = await prisma.user.create({ data: { email: createUniqueEmail("safe-sync"), passwordHash: "test" } });
    const fund = await prisma.fund.create({
      data: {
        code: "110022",
        market: "CN_FUND",
        followers: { create: { userId: user.id } },
        navSnapshots: { create: { valuationDate: new Date("2020-01-01T00:00:00Z"), unitNav: 1, accumulatedNav: 1, source: "previous" } },
      },
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("pingzhongdata")) return new Response("var unavailable = true;");
      if (url.includes("/f10/lsjz") && url.includes("pageIndex=1")) {
        return Response.json({ Data: { LSJZList: [
          { FSRQ: "2026-01-03", DWJZ: "1.3", LJJZ: "1.3" },
          { FSRQ: "2026-01-02", DWJZ: "1.2", LJJZ: "1.2" },
        ] }, TotalCount: 3, PageSize: 2, PageIndex: 1 });
      }
      return new Response("upstream failed", { status: 503 });
    }));

    const detail = await syncFund(user.id, fund.id, true);
    expect(detail.navSnapshots).toEqual([
      expect.objectContaining({ valuationDate: "2020-01-01T00:00:00.000Z", unitNav: 1 }),
    ]);
    expect(detail.latestSyncError).toContain("nav:");
  }, 10_000);
});

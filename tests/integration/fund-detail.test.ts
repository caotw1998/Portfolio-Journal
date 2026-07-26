import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getFundDetail, getFundPortfolioReport, syncFund } from "@/lib/funds/service";
import { createUniqueEmail, resetDatabase } from "./helpers";

describe("fund detail service", () => {
  beforeEach(resetDatabase);
  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
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
            holdings: { create: { kind: "stock", rank: 1, name: `持仓${index + 1}`, quantity: index + 1 } },
          })),
        },
      },
    });

    const detail = await getFundDetail(user.id, fund.id);
    expect(detail.portfolioReports).toHaveLength(6);
    const report = await getFundPortfolioReport(user.id, fund.id, detail.portfolioReports[0]?.id);
    expect(report.holdings[0]?.quantity).toBe(6);
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

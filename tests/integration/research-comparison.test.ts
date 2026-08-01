import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/responses";
import { compareDetailSeries, compareResearchSeries, listDetailBaselineOptions, listUserFunds } from "@/lib/funds/service";
import { createUniqueEmail, resetDatabase } from "./helpers";

async function seedResearchData() {
  const user = await prisma.user.create({ data: { email: createUniqueEmail("research"), passwordHash: "test" } });
  const fund = await prisma.fund.create({
    data: {
      code: "110022", name: "测试消费基金", market: "CN_FUND", type: "股票型",
      managementFeeRate: 0.012, custodianFeeRate: 0.002, salesServiceFeeRate: 0,
      followers: { create: { userId: user.id } },
      navSnapshots: { create: [
        { valuationDate: new Date("2025-01-02T00:00:00Z"), unitNav: 1, accumulatedNav: 2, source: "test" },
        { valuationDate: new Date("2026-01-02T00:00:00Z"), unitNav: 1.1, accumulatedNav: 2.3, source: "test" },
      ] },
      dividendEvents: { create: { exDate: new Date("2026-01-02T00:00:00Z"), amount: 0.1, source: "test" } },
    },
  });
  const benchmark = await prisma.benchmarkInstrument.create({
    data: {
      userId: user.id, code: "000300", market: "CN", name: "沪深300", provider: "public_market",
      priceSnapshots: { create: [
        { date: new Date("2025-01-02T00:00:00Z"), closeValue: 3500, source: "test" },
        { date: new Date("2026-01-02T00:00:00Z"), closeValue: 3850, source: "test" },
      ] },
    },
  });
  return { user, fund, benchmark };
}

async function seedSecondFundAndBenchmark(userId: string) {
  const fund = await prisma.fund.create({
    data: {
      code: "000001", name: "测试价值基金", market: "CN_FUND", type: "混合型",
      followers: { create: { userId } },
      navSnapshots: { create: [
        { valuationDate: new Date("2025-01-02T00:00:00Z"), unitNav: 2, source: "test" },
        { valuationDate: new Date("2026-01-02T00:00:00Z"), unitNav: 2.3, source: "test" },
      ] },
    },
  });
  const benchmark = await prisma.benchmarkInstrument.create({
    data: {
      userId, code: "000905", market: "CN", name: "中证500", provider: "public_market",
      priceSnapshots: { create: [
        { date: new Date("2025-01-02T00:00:00Z"), closeValue: 5000, source: "test" },
        { date: new Date("2026-01-02T00:00:00Z"), closeValue: 5750, source: "test" },
      ] },
    },
  });
  return { fund, benchmark };
}

describe("fund research service", () => {
  beforeEach(resetDatabase);

  test("lists only followed funds and compares dividend-reinvested return with one owned index", async () => {
    const { user, fund, benchmark } = await seedResearchData();
    const library = await listUserFunds(user.id);
    expect(library).toEqual([expect.objectContaining({ id: fund.id, code: "110022" })]);
    expect(library[0]?.annualFees).toEqual({ management: 0.012, custodian: 0.002, salesService: 0, total: 0.014, complete: true });
    expect(library[0]?.navSnapshots[0]?.unitNav).toBeTypeOf("number");
    const result = await compareResearchSeries({ userId: user.id, fundIds: [fund.id], benchmarkId: benchmark.id });
    expect(result.range).toEqual({ from: "2025-01-02", to: "2026-01-02" });
    expect(result.series.map((series) => series.basis)).toEqual(["dividend_reinvested", "close"]);
    expect(result.series[0]?.metrics.rangeReturn).toBeCloseTo(0.2);
  });

  test("rejects more than five funds and cross-user access", async () => {
    const { user, fund, benchmark } = await seedResearchData();
    await expect(compareResearchSeries({ userId: user.id, fundIds: ["1", "2", "3", "4", "5", "6"], benchmarkId: benchmark.id })).rejects.toBeInstanceOf(ApiError);
    const another = await prisma.user.create({ data: { email: createUniqueEmail("other"), passwordHash: "test" } });
    await expect(compareResearchSeries({ userId: another.id, fundIds: [fund.id], benchmarkId: benchmark.id })).rejects.toMatchObject({ status: 403 });
  });

  test("does not depend on accumulated NAV", async () => {
    const { user, fund, benchmark } = await seedResearchData();
    await prisma.fundNavSnapshot.updateMany({ where: { fundId: fund.id }, data: { accumulatedNav: null } });
    const result = await compareResearchSeries({ userId: user.id, fundIds: [fund.id], benchmarkId: benchmark.id });
    expect(result.series[0]?.basis).toBe("dividend_reinvested");
    expect(result.warnings).toEqual([]);
  });

  test("recalculates both series from the requested common start date", async () => {
    const { user, fund, benchmark } = await seedResearchData();
    await prisma.fundNavSnapshot.create({
      data: { fundId: fund.id, valuationDate: new Date("2025-07-02T00:00:00Z"), unitNav: 1.05, accumulatedNav: 2.1, source: "test" },
    });
    await prisma.benchmarkPriceSnapshot.create({
      data: { benchmarkInstrumentId: benchmark.id, date: new Date("2025-07-03T00:00:00Z"), closeValue: 3600, source: "test" },
    });

    const result = await compareResearchSeries({
      userId: user.id,
      fundIds: [fund.id],
      benchmarkId: benchmark.id,
      from: "2025-07-01",
      to: "2026-01-02",
    });

    expect(result.range).toEqual({ from: "2025-07-03", to: "2026-01-02" });
    expect(result.series.every((series) => series.points[0]?.normalizedValue === 1)).toBe(true);
  });

  test.each([
    ["fund", "fund"],
    ["fund", "benchmark"],
    ["benchmark", "fund"],
    ["benchmark", "benchmark"],
  ] as const)("compares a %s primary with a %s baseline in role order", async (primaryKind, baselineKind) => {
    const { user, fund, benchmark } = await seedResearchData();
    const second = await seedSecondFundAndBenchmark(user.id);
    const primaryId = primaryKind === "fund" ? fund.id : benchmark.id;
    const baselineId = baselineKind === "fund" ? second.fund.id : second.benchmark.id;

    const result = await compareDetailSeries({ userId: user.id, primaryKind, primaryId, baselineKind, baselineId });

    expect(result.series).toHaveLength(2);
    expect(result.series.map((series) => series.id)).toEqual([primaryId, baselineId]);
    expect(result.series.map((series) => series.kind)).toEqual([primaryKind, baselineKind]);
    expect(result.series.every((series) => series.points[0]?.normalizedValue === 1)).toBe(true);
  });

  test("lists only owned baselines with usable data and rejects self comparison", async () => {
    const { user, fund, benchmark } = await seedResearchData();
    const emptyBenchmark = await prisma.benchmarkInstrument.create({
      data: { userId: user.id, code: "EMPTY", market: "GLOBAL", name: "空指数", provider: "public_market" },
    });
    const options = await listDetailBaselineOptions(user.id);

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fund.id, kind: "fund", code: fund.code }),
      expect.objectContaining({ id: benchmark.id, kind: "benchmark", code: benchmark.code }),
    ]));
    expect(options.some((option) => option.id === emptyBenchmark.id)).toBe(false);
    await expect(compareDetailSeries({ userId: user.id, primaryKind: "fund", primaryId: fund.id, baselineKind: "fund", baselineId: fund.id })).rejects.toMatchObject({ status: 400 });
  });
});

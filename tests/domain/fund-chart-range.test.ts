import { describe, expect, test } from "vitest";
import {
  buildComparisonReturnSeries,
  buildDrawdownSeries,
  buildFundReturnSeries,
  buildManagerChangeMarkers,
  calculateAnnualizedReturn,
  buildMarketCycleLabelPresentation,
  buildMarketCycleSegments,
  calculateMarketCyclePerformance,
  calculateDrawdownRecovery,
  calculateSelectedRangeMetrics,
  filterFundNavPoints,
  snapChartDate,
  resolveCurrentManagerStartDate,
} from "@/lib/funds/chart-range";

const points = [
  { date: "2024-01-31", unitNav: 1, accumulatedNav: 1, dividendAmount: 0 },
  { date: "2024-12-31", unitNav: 1.1, accumulatedNav: 1.1, dividendAmount: 0 },
  { date: "2025-12-31", unitNav: 1.2, accumulatedNav: 1.2, dividendAmount: 0.1 },
  { date: "2026-06-30", unitNav: 1.3, accumulatedNav: 1.3, dividendAmount: 0 },
];

describe("fund chart range", () => {
  test("uses the latest observation as the preset endpoint", () => {
    expect(filterFundNavPoints(points, { from: "2025-06-30", to: "2026-06-30" }))
      .toEqual(points.slice(2));
  });

  test("keeps both endpoints in a custom range", () => {
    expect(filterFundNavPoints(points, { from: "2024-12-31", to: "2025-12-31" }))
      .toEqual(points.slice(1, 3));
  });

  test("returns all observations for the inception range", () => {
    expect(filterFundNavPoints(points, null)).toEqual(points);
  });

  test("normalizes dividend-reinvested performance to the selected first observation", () => {
    const result = buildFundReturnSeries(points.slice(1));
    expect(result.basis).toBe("dividend_reinvested");
    expect(result.points.map((point) => point.returnRate)).toEqual([0, expect.closeTo(0.181818, 5), expect.closeTo(0.280303, 5)]);
  });

  test("falls back to unit NAV and handles a single point", () => {
    expect(buildFundReturnSeries([{ date: "2026-01-01", unitNav: 2, accumulatedNav: null, dividendAmount: 0 }])).toMatchObject({
      basis: "dividend_reinvested",
      points: [{ returnRate: 0 }],
    });
  });

  test("keeps chart returns continuous across an ETF share split", () => {
    const result = buildFundReturnSeries([
      { date: "2026-07-16", unitNav: 2.8071, accumulatedNav: 2.8071, dailyReturn: -0.0331, dividendAmount: 0 },
      { date: "2026-07-17", unitNav: 0.624, accumulatedNav: 2.496, dailyReturn: -0.1108, dividendAmount: 0 },
      { date: "2026-07-20", unitNav: 0.5841, accumulatedNav: 2.3364, dailyReturn: -0.0639, dividendAmount: 0 },
    ]);

    expect(result.points.map((point) => point.returnRate)).toEqual([
      0,
      expect.closeTo(-0.1108, 10),
      expect.closeTo((1 - 0.1108) * (1 - 0.0639) - 1, 10),
    ]);
  });

  test("converts normalized fund and benchmark points to the same zero-based percentage scale", () => {
    const result = buildComparisonReturnSeries([
      {
        id: "fund",
        kind: "fund",
        name: "测试基金",
        code: "000001",
        basis: "accumulated_nav",
        points: [
          { date: "2026-01-02", value: 2, normalizedValue: 1 },
          { date: "2026-01-05", value: 2.2, normalizedValue: 1.1 },
        ],
      },
      {
        id: "benchmark",
        kind: "benchmark",
        name: "沪深300",
        code: "000300",
        basis: "close",
        points: [
          { date: "2026-01-02", value: 3500, normalizedValue: 1 },
          { date: "2026-01-05", value: 3430, normalizedValue: 0.98 },
        ],
      },
    ]);

    expect(result[0]?.points.map((point) => point.returnRate)).toEqual([0, expect.closeTo(0.1)]);
    expect(result[1]?.points.map((point) => point.returnRate)).toEqual([0, expect.closeTo(-0.02)]);
    expect(result[1]?.points[1]?.value).toBe(3430);
  });

  test("annualizes the visible interval from its actual first and last dates", () => {
    const annualized = calculateAnnualizedReturn([
      { date: "2025-01-01", value: 2 },
      { date: "2025-07-02", value: 2.1 },
    ]);

    expect(annualized).toBeCloseTo(Math.pow(1.05, 365.25 / 182) - 1, 10);
    expect(calculateAnnualizedReturn([{ date: "2025-01-01", value: 2 }])).toBeNull();
    expect(calculateAnnualizedReturn([
      { date: "2025-01-01", value: 0 },
      { date: "2026-01-01", value: 2 },
    ])).toBeNull();
  });

  test("maps later manager starts to the next NAV date and merges same-day appointments", () => {
    const markers = buildManagerChangeMarkers(
      [
        { managerName: "初始甲", startDate: "2020-01-01", endDate: "2024-05-31" },
        { managerName: "初始乙", startDate: "2020-01-01", endDate: "2024-05-31" },
        { managerName: "新任甲", startDate: "2024-06-01", endDate: null },
        { managerName: "新任乙", startDate: "2024-06-01", endDate: null },
        { managerName: "区间外", startDate: "2026-01-01", endDate: null },
      ],
      [
        { date: "2024-05-31" },
        { date: "2024-06-03" },
        { date: "2025-12-31" },
      ],
    );

    expect(markers).toEqual([
      {
        valuationDate: "2024-06-03",
        changes: [{ date: "2024-06-01", managerNames: ["新任甲", "新任乙"] }],
      },
    ]);
  });

  test("uses the earliest valid start date among current managers", () => {
    expect(resolveCurrentManagerStartDate([
      { managerName: "历史经理", startDate: "2018-01-01", endDate: "2021-12-31" },
      { managerName: "现任乙", startDate: "2023-06-01", endDate: null },
      { managerName: "现任甲", startDate: "2021-12-31", endDate: null },
      { managerName: "日期缺失", startDate: null, endDate: null },
    ])).toBe("2021-12-31");
  });

  test("returns null when no current manager has a valid start date", () => {
    expect(resolveCurrentManagerStartDate([
      { managerName: "历史经理", startDate: "2018-01-01", endDate: "2021-12-31" },
      { managerName: "日期缺失", startDate: null, endDate: null },
    ])).toBeNull();
  });

  test("finds the deepest drawdown and its eventual recovery interval", () => {
    const result = calculateDrawdownRecovery([
      { date: "2024-01-01", value: 100 },
      { date: "2024-02-01", value: 80 },
      { date: "2024-03-01", value: 110 },
      { date: "2024-04-01", value: 55 },
      { date: "2024-05-01", value: 90 },
      { date: "2024-06-01", value: 110 },
    ]);

    expect(result).toEqual({
      maxDrawdown: -0.5,
      peakDate: "2024-03-01",
      troughDate: "2024-04-01",
      recoveryDate: "2024-06-01",
      declineDays: 31,
      recoveryDays: 61,
    });
  });

  test("reports an unrecovered drawdown without inventing a recovery date", () => {
    expect(calculateDrawdownRecovery([
      { date: "2025-01-01", value: 1 },
      { date: "2025-03-01", value: 0.7 },
      { date: "2025-06-01", value: 0.9 },
    ])).toEqual({
      maxDrawdown: -0.3,
      peakDate: "2025-01-01",
      troughDate: "2025-03-01",
      recoveryDate: null,
      declineDays: 59,
      recoveryDays: null,
    });
    expect(calculateDrawdownRecovery([{ date: "2025-01-01", value: 1 }])).toBeNull();
    expect(calculateDrawdownRecovery([
      { date: "2025-01-01", value: 1 },
      { date: "2025-02-01", value: 1 },
    ])).toEqual({
      maxDrawdown: 0,
      peakDate: null,
      troughDate: null,
      recoveryDate: null,
      declineDays: null,
      recoveryDays: null,
    });
  });

  test("builds an underwater drawdown series from each running peak", () => {
    expect(buildDrawdownSeries([
      { date: "2025-01-01", value: 100 },
      { date: "2025-02-01", value: 80 },
      { date: "2025-03-01", value: 120 },
      { date: "2025-04-01", value: 90 },
    ])).toEqual([
      { date: "2025-01-01", value: 100, drawdown: 0 },
      { date: "2025-02-01", value: 80, drawdown: -0.2 },
      { date: "2025-03-01", value: 120, drawdown: 0 },
      { date: "2025-04-01", value: 90, drawdown: -0.25 },
    ]);
  });

  test("snaps a fractional chart position to the nearest available trading day", () => {
    const dates = ["2026-01-02", "2026-01-05", "2026-01-06"];
    expect(snapChartDate(dates, -4)).toBe("2026-01-02");
    expect(snapChartDate(dates, 1.49)).toBe("2026-01-05");
    expect(snapChartDate(dates, 99)).toBe("2026-01-06");
    expect(snapChartDate([], 0)).toBeNull();
  });

  test("calculates a reversed two-point selection with fund, benchmark and excess metrics", () => {
    const result = calculateSelectedRangeMetrics([
      {
        id: "fund",
        kind: "fund",
        name: "测试基金",
        code: "000001",
        basis: "dividend_reinvested",
        points: [
          { date: "2025-01-01", value: 1, returnRate: 0 },
          { date: "2025-07-02", value: 0.8, returnRate: -0.2 },
          { date: "2026-01-01", value: 1.2, returnRate: 0.2 },
        ],
      },
      {
        id: "benchmark",
        kind: "benchmark",
        name: "测试指数",
        code: "000300",
        basis: "close",
        points: [
          { date: "2025-01-01", value: 100, returnRate: 0 },
          { date: "2025-07-02", value: 90, returnRate: -0.1 },
          { date: "2026-01-01", value: 110, returnRate: 0.1 },
        ],
      },
    ], "2026-01-01", "2025-01-01");

    expect(result).not.toBeNull();
    expect(result?.from).toBe("2025-01-01");
    expect(result?.to).toBe("2026-01-01");
    expect(result?.days).toBe(365);
    expect(result?.series[0]?.returnRate).toBeCloseTo(0.2, 10);
    expect(result?.series[0]?.maxDrawdown).toBeCloseTo(-0.2, 10);
    expect(result?.series[0]?.annualizedReturn).toBeCloseTo(Math.pow(1.2, 365.25 / 365) - 1, 10);
    expect(result?.series[1]?.returnRate).toBeCloseTo(0.1, 10);
    expect(result?.excessReturn).toBeCloseTo(0.1, 10);
  });

  test("treats the first series as primary and the second as baseline for same-kind excess return", () => {
    const result = calculateSelectedRangeMetrics([
      {
        id: "primary",
        kind: "fund",
        name: "主基金",
        code: "000001",
        basis: "dividend_reinvested",
        points: [
          { date: "2025-01-01", value: 1, returnRate: 0 },
          { date: "2026-01-01", value: 1.2, returnRate: 0.2 },
        ],
      },
      {
        id: "baseline",
        kind: "fund",
        name: "基准基金",
        code: "000002",
        basis: "dividend_reinvested",
        points: [
          { date: "2025-01-01", value: 2, returnRate: 0 },
          { date: "2026-01-01", value: 2.2, returnRate: 0.1 },
        ],
      },
    ], "2025-01-01", "2026-01-01");

    expect(result?.excessReturn).toBeCloseTo(0.1, 10);
  });

  test("does not calculate a two-finger interval when both endpoints are the same day", () => {
    expect(calculateSelectedRangeMetrics([], "2026-01-01", "2026-01-01")).toBeNull();
  });

  test("scales bull and bear labels at the exact compact and full width boundaries", () => {
    const cycle = {
      id: "bull-1",
      label: "测试牛市",
      kind: "bull" as const,
      from: "2024-01-01",
      to: "2025-01-01",
      primaryReturn: 0.122,
      baselineReturn: 0.101,
      excessReturn: 0.021,
      primaryAnnualizedReturn: 0.122,
      baselineAnnualizedReturn: 0.101,
      annualizedExcessReturn: 0.021,
    };

    expect(buildMarketCycleLabelPresentation(cycle, 40, true, 0)).toMatchObject({ mode: "vertical", fontSize: 6.71 });
    expect(buildMarketCycleLabelPresentation(cycle, 56, true, 1)).toMatchObject({ mode: "compact", fontSize: 7, lane: 1 });
    expect(buildMarketCycleLabelPresentation(cycle, 95, true, 2)).toMatchObject({ mode: "compact", fontSize: 9, lane: 2 });
    expect(buildMarketCycleLabelPresentation(cycle, 96, true, 0)).toMatchObject({ mode: "full", fontSize: 9 });
    expect(buildMarketCycleLabelPresentation(cycle, 140, true, 0)).toMatchObject({ mode: "full", fontSize: 10 });
  });

  test("includes baseline annualized and annualized excess in cycle labels", () => {
    const cycle = {
      id: "bear-1",
      label: "测试熊市",
      kind: "bear" as const,
      from: "2024-01-01",
      to: "2025-01-01",
      primaryReturn: -0.12,
      baselineReturn: -0.08,
      excessReturn: -0.04,
      primaryAnnualizedReturn: -0.12,
      baselineAnnualizedReturn: -0.08,
      annualizedExcessReturn: -0.04,
    };
    const withBaseline = buildMarketCycleLabelPresentation(cycle, 140, true, 0);
    expect(withBaseline.lines).toEqual(["熊市", "主标年化 -12.00%", "基准年化 -8.00%", "年化超额 -4.00%"]);
    expect(withBaseline.ariaLabel).toContain("基准年化 -8.00%");
    expect(withBaseline.ariaLabel).toContain("年化超额 -4.00%");

    const withoutBaseline = buildMarketCycleLabelPresentation(cycle, 140, false, 0);
    expect(withoutBaseline.lines).toEqual(["熊市", "主标年化 -12.00%"]);
    expect(withoutBaseline.ariaLabel).not.toContain("基准年化");
  });

  test("calculates the baseline annualized return before annualized excess", () => {
    const metrics = calculateMarketCyclePerformance([
      {
        id: "primary", kind: "fund", name: "主标", code: "1", basis: "dividend_reinvested",
        points: [{ date: "2025-01-01", value: 1, returnRate: 0 }, { date: "2026-01-01", value: 1.2, returnRate: 0.2 }],
      },
      {
        id: "baseline", kind: "benchmark", name: "基准", code: "2", basis: "close",
        points: [{ date: "2025-01-01", value: 100, returnRate: 0 }, { date: "2026-01-01", value: 110, returnRate: 0.1 }],
      },
    ], [{ id: "bull", label: "测试牛市", kind: "bull", from: "2025-01-01", to: "2026-01-01" }]);

    expect(metrics[0]?.baselineAnnualizedReturn).toBeCloseTo(Math.pow(1.1, 365.25 / 365) - 1, 10);
    expect(metrics[0]?.annualizedExcessReturn).toBeCloseTo(
      Math.pow(1.2, 365.25 / 365) - Math.pow(1.1, 365.25 / 365),
      10,
    );
  });

  test("resets each market-cycle curve and assigns a shared boundary to the next cycle", () => {
    const segments = buildMarketCycleSegments([
      {
        id: "primary", kind: "fund", name: "主标", code: "1", basis: "dividend_reinvested",
        points: [
          { date: "2025-01-01", value: 1, returnRate: 0 },
          { date: "2025-06-01", value: 1.2, returnRate: 0.2 },
          { date: "2025-07-01", value: 1.1, returnRate: 0.1 },
          { date: "2025-12-31", value: 1.32, returnRate: 0.32 },
        ],
      },
      {
        id: "baseline", kind: "benchmark", name: "基准", code: "2", basis: "close",
        points: [
          { date: "2025-01-01", value: 100, returnRate: 0 },
          { date: "2025-06-01", value: 110, returnRate: 0.1 },
          { date: "2025-07-01", value: 105, returnRate: 0.05 },
          { date: "2025-12-31", value: 120, returnRate: 0.2 },
        ],
      },
    ], [
      { id: "first", label: "第一段", kind: "bull", from: "2025-01-01", to: "2025-07-01" },
      { id: "second", label: "第二段", kind: "bear", from: "2025-07-01", to: "2025-12-31" },
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.series[0]?.points.map((point) => point.date)).toEqual(["2025-01-01", "2025-06-01"]);
    expect(segments[1]?.series[0]?.points[0]).toMatchObject({ date: "2025-07-01", returnRate: 0 });
    expect(segments[1]?.cycle?.primaryReturn).toBeCloseTo(0.2, 10);
    expect(segments[1]?.cycle?.baselineReturn).toBeCloseTo(120 / 105 - 1, 10);
    expect(segments[1]?.cycle?.excessReturn).toBeCloseTo(1.32 / 1.1 - 120 / 105, 10);
  });
});

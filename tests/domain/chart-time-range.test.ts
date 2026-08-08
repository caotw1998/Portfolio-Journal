import { describe, expect, test } from "vitest";
import {
  A_SHARE_MARKET_CYCLE_OPTIONS,
  resolveFixedRange,
  resolveFixedStartRange,
  resolvePresetRange,
} from "@/lib/chart-time-range";
import {
  calculateMarketCyclePerformance,
  restrictComparisonSeriesToRange,
  type ComparisonReturnSeries,
} from "@/lib/funds/chart-range";

describe("chart market cycle ranges", () => {
  test("exposes the approved A-share cycle anchors", () => {
    expect(A_SHARE_MARKET_CYCLE_OPTIONS).toHaveLength(9);
    expect(A_SHARE_MARKET_CYCLE_OPTIONS[0]).toEqual({ id: "a-share-market-2024", label: "2024 行情", kind: "market", from: "2024-09-24", to: null });
    expect(A_SHARE_MARKET_CYCLE_OPTIONS[1]).toEqual({ id: "a-share-bear-2021", label: "2021—2024 熊市", kind: "bear", from: "2021-02-18", to: "2024-09-24" });
    expect(A_SHARE_MARKET_CYCLE_OPTIONS.at(-1)).toEqual({ id: "a-share-bull-2005", label: "2005—2007 牛市", kind: "bull", from: "2005-06-06", to: "2007-10-16" });
    expect(A_SHARE_MARKET_CYCLE_OPTIONS.map((cycle) => cycle.from))
      .toEqual([...A_SHARE_MARKET_CYCLE_OPTIONS.map((cycle) => cycle.from)].sort().reverse());
  });

  test("uses both boundaries for a closed market cycle and clamps to coverage", () => {
    expect(resolveFixedRange({ from: "2019-01-04", to: "2021-02-18" }, { from: "2010-01-01", to: "2026-07-21" })).toEqual({
      range: { from: "2019-01-04", to: "2021-02-18" },
      clampedFrom: false,
      clampedTo: false,
    });
    expect(resolveFixedRange({ from: "2019-01-04", to: "2021-02-18" }, { from: "2020-01-01", to: "2020-12-31" })).toEqual({
      range: { from: "2020-01-01", to: "2020-12-31" },
      clampedFrom: true,
      clampedTo: true,
    });
    expect(resolveFixedRange({ from: "2024-09-24", to: null }, { from: "2020-01-01", to: "2026-07-21" }).range).toEqual({ from: "2024-09-24", to: "2026-07-21" });
  });

  test("uses the fixed cycle start and clamps it to fund inception", () => {
    expect(resolveFixedStartRange("2014-07-21", { from: "2010-01-01", to: "2026-07-21" })).toEqual({
      range: { from: "2014-07-21", to: "2026-07-21" },
      clampedToAvailableStart: false,
    });
    expect(resolveFixedStartRange("2014-07-21", { from: "2020-01-02", to: "2026-07-21" })).toEqual({
      range: { from: "2020-01-02", to: "2026-07-21" },
      clampedToAvailableStart: true,
    });
  });

  test("includes the preceding available observation for rolling presets", () => {
    expect(resolvePresetRange("1y", { from: "2024-01-02", to: "2026-08-08" }, [
      "2024-01-02", "2025-08-05", "2025-08-06", "2026-08-08",
    ])).toEqual({ from: "2025-08-06", to: "2026-08-08" });
    expect(resolvePresetRange("1m", { from: "2026-08-01", to: "2026-08-08" }, [
      "2026-08-01", "2026-08-08",
    ])).toEqual({ from: "2026-08-01", to: "2026-08-08" });
  });
});

describe("comparison range and cycle performance", () => {
  const comparison: ComparisonReturnSeries[] = [
    { id: "fund", kind: "fund", name: "基金", code: "F", basis: "unit_nav", points: [
      { date: "2020-01-01", value: 1, returnRate: 0 },
      { date: "2021-01-01", value: 1.2, returnRate: 0.2 },
      { date: "2022-01-01", value: 1.1, returnRate: 0.1 },
    ] },
    { id: "benchmark", kind: "benchmark", name: "基准", code: "B", basis: "close", points: [
      { date: "2021-01-01", value: 100, returnRate: 0 },
      { date: "2022-01-01", value: 105, returnRate: 0.05 },
      { date: "2023-01-01", value: 110, returnRate: 0.1 },
    ] },
  ];

  test("automatically narrows a requested range to common coverage and rebases both series", () => {
    const result = restrictComparisonSeriesToRange(comparison, { from: "2020-01-01", to: "2023-01-01" });
    expect(result.range).toEqual({ from: "2021-01-01", to: "2022-01-01" });
    expect(result.clamped).toBe(true);
    expect(result.series[0]!.points[0]!.returnRate).toBe(0);
    expect(result.series[0]!.points[1]!.returnRate).toBeCloseTo(-1 / 12, 10);
    expect(result.series[1]!.points[0]!.returnRate).toBe(0);
    expect(result.series[1]!.points[1]!.returnRate).toBeCloseTo(0.05, 10);
  });

  test("calculates annualized excess for each visible bull/bear interval", () => {
    const cycles = calculateMarketCyclePerformance(comparison, [{
      id: "cycle", label: "测试牛市", kind: "bull", from: "2021-01-01", to: "2022-01-01",
    }]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ id: "cycle", kind: "bull", from: "2021-01-01", to: "2022-01-01" });
    expect(cycles[0]!.primaryAnnualizedReturn).toBeCloseTo(-1 / 12, 3);
    expect(cycles[0]!.annualizedExcessReturn).toBeCloseTo(-1 / 12 - 0.05, 3);
  });
});

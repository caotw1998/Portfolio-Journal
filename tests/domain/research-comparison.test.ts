import { describe, expect, test } from "vitest";
import { buildResearchComparison, computeResearchMetrics } from "@/lib/funds/comparison";

describe("research comparison", () => {
  test("uses the common range and forward-fills known observations only", () => {
    const result = buildResearchComparison([
      { id: "fund", kind: "fund", name: "基金", code: "000001", basis: "accumulated_nav", points: [{ date: "2026-01-01", value: 1 }, { date: "2026-01-03", value: 1.1 }] },
      { id: "index", kind: "benchmark", name: "指数", code: "000300", basis: "close", points: [{ date: "2026-01-02", value: 100 }, { date: "2026-01-03", value: 105 }] },
    ]);
    expect(result.range).toEqual({ from: "2026-01-02", to: "2026-01-03" });
    expect(result.series[0]?.points).toEqual([
      { date: "2026-01-02", value: 1, normalizedValue: 1 },
      { date: "2026-01-03", value: 1.1, normalizedValue: 1.1 },
    ]);
  });

  test("reports no-overlap and missing-series warnings", () => {
    expect(buildResearchComparison([
      { id: "a", kind: "fund", name: "A", code: "A", basis: "unit_nav", points: [{ date: "2020-01-01", value: 1 }] },
      { id: "b", kind: "benchmark", name: "B", code: "B", basis: "close", points: [{ date: "2021-01-01", value: 1 }] },
    ]).warnings[0]).toContain("没有共同数据区间");
    expect(buildResearchComparison([{ id: "a", kind: "fund", name: "A", code: "A", basis: "unit_nav", points: [] }]).series).toEqual([]);
  });

  test("computes all five metrics on native points", () => {
    const metrics = computeResearchMetrics([
      { date: "2025-01-01", value: 1 },
      { date: "2025-07-01", value: 1.2 },
      { date: "2026-01-01", value: 1.1 },
    ]);
    expect(metrics.rangeReturn).toBeCloseTo(0.1);
    expect(metrics.annualizedReturn).not.toBeNull();
    expect(metrics.maxDrawdown).toBeCloseTo(-0.08333333);
    expect(metrics.volatility).not.toBeNull();
    expect(metrics.sharpeRatio).not.toBeNull();
  });
});

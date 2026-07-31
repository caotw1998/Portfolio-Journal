import { describe, expect, test } from "vitest";
import { buildDividendAdjustedSeries, calculateSeriesMetrics } from "@/lib/funds/metrics";

describe("fund decision metrics", () => {
  test("calculates return, drawdown and annualized risk metrics", () => {
    const metrics = calculateSeriesMetrics([
      { date: "2023-01-01", value: 1 },
      { date: "2024-01-01", value: 1.2 },
      { date: "2025-01-01", value: 0.9 },
      { date: "2026-01-01", value: 1.5 },
    ]);
    expect(metrics.totalReturn).toBeCloseTo(0.5);
    expect(metrics.threeYearReturn).toBeCloseTo(0.5);
    expect(metrics.maxDrawdown).toBeCloseTo(-0.25);
    expect(metrics.annualizedReturn).toBeGreaterThan(0);
    expect(metrics.calmar).toBeGreaterThan(0);
  });

  test("returns null metrics when observations are insufficient", () => {
    expect(calculateSeriesMetrics([{ date: "2026-01-01", value: 1 }]).maxDrawdown).toBeNull();
  });

  test("builds total return from unit NAV and reinvests every ex-date dividend", () => {
    const series = buildDividendAdjustedSeries([
      { date: "2025-07-23", unitNav: 1.292, dividendAmount: 0 },
      { date: "2025-12-12", unitNav: 2.115, dividendAmount: 0 },
      { date: "2025-12-15", unitNav: 1.811, dividendAmount: 0.23473 },
      { date: "2026-06-12", unitNav: 3.383, dividendAmount: 0 },
      { date: "2026-06-15", unitNav: 3.157, dividendAmount: 0.4632 },
      { date: "2026-07-23", unitNav: 2.447, dividendAmount: 0 },
    ]);

    expect(series[0]).toEqual({ date: "2025-07-23", value: 1 });
    expect(series.at(-1)!.value - 1).toBeCloseTo(
      (2.447 / 1.292) * (1 + 0.23473 / 1.811) * (1 + 0.4632 / 3.157) - 1,
      10,
    );
  });

  test("does not count a dividend attached to the selected starting observation", () => {
    expect(buildDividendAdjustedSeries([
      { date: "2025-12-15", unitNav: 1.811, dividendAmount: 0.23473 },
      { date: "2025-12-16", unitNav: 1.77, dividendAmount: 0 },
    ]).map((point) => point.value)).toEqual([1, expect.closeTo(1.77 / 1.811, 10)]);
  });

  test("uses daily total returns across an ETF share split", () => {
    const series = buildDividendAdjustedSeries([
      { date: "2026-07-16", unitNav: 2.8071, dailyReturn: -0.0331 },
      { date: "2026-07-17", unitNav: 0.624, dailyReturn: -0.1108, dividendAmount: 4 },
      { date: "2026-07-20", unitNav: 0.5841, dailyReturn: -0.0639 },
    ]);

    expect(series.map((point) => point.value)).toEqual([
      1,
      expect.closeTo(1 - 0.1108, 10),
      expect.closeTo((1 - 0.1108) * (1 - 0.0639), 10),
    ]);
  });

  test("accepts a zero daily return and falls back point by point for invalid returns", () => {
    const series = buildDividendAdjustedSeries([
      { date: "2026-01-01", unitNav: 1 },
      { date: "2026-01-02", unitNav: 1.2, dailyReturn: 0 },
      { date: "2026-01-03", unitNav: 1.1, dailyReturn: -1 },
      { date: "2026-01-04", unitNav: 1, dailyReturn: Number.NaN, dividendAmount: 0.1 },
    ]);

    expect(series.map((point) => point.value)).toEqual([
      1,
      1,
      expect.closeTo(1.1 / 1.2, 10),
      expect.closeTo(1.1 / 1.2, 10),
    ]);
  });
});

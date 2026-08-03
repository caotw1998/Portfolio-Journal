import { describe, expect, test } from "vitest";
import {
  calculateValuationSummary,
  formatValuationAxisTick,
  parseCsindexCurrentValuationPayload,
  parseCsindexPePayload,
} from "@/lib/domain/benchmark-valuations";

describe("benchmark valuation", () => {
  test("parses official CSI rolling PE history", () => {
    expect(parseCsindexPePayload({ code: "200", success: true, data: [
      { tradeDate: "20260803", peg: 8.91 },
      { tradeDate: "invalid", peg: 9.1 },
    ] })).toEqual([{ date: "2026-08-03", peTtm: 8.91 }]);
  });

  test("parses current PE, PB and dividend yield by official index name", () => {
    const payload = { code: "200", success: true, data: { tradeDate: "20260803", indexValuations: [
      { indexName: "沪深300", peg: 14.23, pb: 1.4, dp: 2.55 },
    ] } };
    expect(parseCsindexCurrentValuationPayload(payload, "沪深300指数")).toEqual([
      { date: "2026-08-03", peTtm: 14.23, pb: 1.4, dividendYield: 2.55 },
    ]);
  });

  test("uses five independent percentile bands and reverses dividend-yield valuation", () => {
    const pePoints = Array.from({ length: 100 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      peTtm: index + 1,
      pb: null,
      dividendYield: index + 1,
    }));
    const pe = calculateValuationSummary(pePoints, "pe", "all");
    const dividend = calculateValuationSummary(pePoints, "dividendYield", "all");
    expect(pe).toMatchObject({ current: 100, percentile: 100, valuationPercentile: 100, band: "极高估", observationCount: 100 });
    expect(dividend).toMatchObject({ current: 100, percentile: 100, valuationPercentile: 0, band: "极低估", observationCount: 100 });
  });

  test("does not assign a valuation band with fewer than 20 observations", () => {
    const summary = calculateValuationSummary(Array.from({ length: 19 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      peTtm: index + 1,
      pb: null,
      dividendYield: null,
    })), "pe", "3y");
    expect(summary).toMatchObject({ observationCount: 19, band: null, percentile: null, valuationPercentile: null });
  });

  test("formats valuation-axis ticks without exposing floating-point boundary noise", () => {
    expect(formatValuationAxisTick(9.300899999999999, "pe")).toBe("9.3");
    expect(formatValuationAxisTick(5.4691, "pb")).toBe("5.47");
    expect(formatValuationAxisTick(4.290000000000001, "dividendYield")).toBe("4.29%");
    expect(formatValuationAxisTick(9, "pe")).toBe("9");
  });
});

import { describe, expect, test } from "vitest";
import { parseBenchmarkValuationCsv } from "@/lib/domain/benchmark-imports";

describe("benchmark CSV imports", () => {
  test("keeps metric-level valuation provenance", () => {
    const rows = parseBenchmarkValuationCsv([
      "index_code,date,pe_ttm,pb,dividend_yield,source,source_url",
      "H30269,2026-08-03,9.16,0.90,4.29,licensed_history,https://example.test/source",
    ].join("\n"));
    expect(rows).toEqual([{
      indexCode: "H30269",
      date: "2026-08-03",
      peTtm: 9.16,
      pb: 0.9,
      dividendYield: 4.29,
      source: "licensed_history",
      sourceUrl: "https://example.test/source",
    }]);
  });

  test("requires at least one valuation metric", () => {
    expect(() => parseBenchmarkValuationCsv([
      "index_code,date,pe_ttm,pb,dividend_yield,source,source_url",
      "H30269,2026-08-03,,,,manual,",
    ].join("\n"))).toThrow("至少一个估值字段");
  });
});

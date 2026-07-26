import { describe, expect, test, vi } from "vitest";
import {
  parseBenchmarkSearchPayload,
  parseCreateBenchmarkInput,
  searchPublicBenchmarks,
} from "@/lib/domain/benchmarks";

describe("benchmark public search", () => {
  const payload = {
    QuotationCodeTable: {
      Data: [
        { Code: "000300", Name: "沪深300", Classify: "Index", SecurityType: "5", SecurityTypeName: "指数", QuoteID: "1.000300" },
        { Code: "SPX", Name: "标普500", Classify: "UniversalIndex", SecurityType: "11", SecurityTypeName: "指数", QuoteID: "100.SPX" },
        { Code: "HSI", Name: "恒生指数", Classify: "HK", SecurityType: "11", SecurityTypeName: "指数", QuoteID: "100.HSI" },
        { Code: "000300", Name: "沪深300重复", Classify: "Index", SecurityType: "5", SecurityTypeName: "指数", QuoteID: "1.000300" },
        { Code: "600000", Name: "浦发银行", Classify: "AStock", SecurityType: "1", SecurityTypeName: "股票", QuoteID: "1.600000" },
      ],
    },
  };

  test("filters non-index rows, maps markets and de-duplicates source symbols", () => {
    expect(parseBenchmarkSearchPayload(payload, "指数")).toEqual([
      { code: "000300", name: "沪深300", market: "SH", source: "eastmoney", sourceSymbol: "1.000300" },
      { code: "SPX", name: "标普500", market: "GLOBAL", source: "eastmoney", sourceSymbol: "100.SPX" },
      { code: "HSI", name: "恒生指数", market: "HK", source: "eastmoney", sourceSymbol: "100.HSI" },
    ]);
  });

  test("ranks an exact code match before provider order", () => {
    expect(parseBenchmarkSearchPayload(payload, "SPX")[0]?.code).toBe("SPX");
  });

  test("validates query length and external response shape", async () => {
    await expect(searchPublicBenchmarks("A")).rejects.toMatchObject({ status: 400 });
    const fetchMock = vi.fn(async () => new Response("not-json", { status: 200 }));
    await expect(searchPublicBenchmarks("沪深", fetchMock)).rejects.toMatchObject({ status: 502 });
  });

  test("searches the public endpoint without relying on a live request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("searchapi.eastmoney.com");
      return Response.json(payload);
    });
    const results = await searchPublicBenchmarks("沪深300", fetchMock);
    expect(results[0]).toMatchObject({ code: "000300", sourceSymbol: "1.000300" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("type=14");
  });

  test("accepts a valid source symbol and rejects arbitrary values", () => {
    expect(parseCreateBenchmarkInput({ code: "spx", market: "global", name: "标普500", sourceSymbol: "100.spx" })).toMatchObject({ code: "SPX", market: "GLOBAL", sourceSymbol: "100.SPX" });
    expect(() => parseCreateBenchmarkInput({ code: "SPX", market: "GLOBAL", name: "标普500", sourceSymbol: "bad symbol" })).toThrow("sourceSymbol 格式无效");
  });
});

import { describe, expect, test, vi } from "vitest";
import {
  benchmarkSeriesMetadata,
  parseBenchmarkSearchPayload,
  parseCreateBenchmarkInput,
  parseYahooBenchmarkSearchPayload,
  sanitizeBenchmarkHistoryPoints,
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

  test("maps a CSI total-return code to its price-index constituent parent", () => {
    expect(benchmarkSeriesMetadata({ code: "H20269", name: "红利低波100全收益指数", parentIndexCode: null, seriesType: "price" })).toEqual({
      seriesType: "total_return",
      parentIndexCode: "H30269",
    });
  });

  test("parses Yahoo index results and ignores ETF proxies", () => {
    expect(parseYahooBenchmarkSearchPayload({ quotes: [
      { symbol: "^SPCLLHCP", longname: "S&P China A-Share LargeCap Low Volatility High Dividend 50 Index", quoteType: "INDEX" },
      { symbol: "515450.SS", longname: "ETF proxy", quoteType: "ETF" },
    ] }, "SPCLLHCP")).toEqual([
      { code: "SPCLLHCP", name: "S&P China A-Share LargeCap Low Volatility High Dividend 50 Index", market: "GLOBAL", source: "yahoo", sourceSymbol: "^SPCLLHCP" },
    ]);
  });

  test("finds the verified S&P index by Chinese alias without substituting an ETF", async () => {
    const fetchMock = vi.fn(async () => Response.json({ QuotationCodeTable: { Data: [] }, quotes: [] }));
    const results = await searchPublicBenchmarks("标普A股大盘红利低波", fetchMock);
    expect(results).toEqual([
      { code: "SPCLLHCP", name: "标普中国A股大盘红利低波50指数", market: "GLOBAL", source: "spglobal", sourceSymbol: "^SPCLLHCP" },
    ]);
    expect(results.some((result) => result.code === "515450")).toBe(false);
  });

  test("finds the official S&P total-return variant separately", async () => {
    const fetchMock = vi.fn(async () => Response.json({ QuotationCodeTable: { Data: [] }, quotes: [] }));
    await expect(searchPublicBenchmarks("标普中国A股大盘红利低波50全收益", fetchMock)).resolves.toEqual([
      { code: "SPCLLHCT", name: "标普中国A股大盘红利低波50全收益指数", market: "GLOBAL", source: "spglobal", sourceSymbol: "^SPCLLHCT" },
    ]);
  });

  test("finds the official CSI total-return derivative instead of guessing its code", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("index-fuzzy-search")) return Response.json({ code: "200", success: true, data: [
        { indexCode: "930955", indexName: "红利低波100", indexNameEn: "Dividend Low Volatility100" },
      ] });
      if (url.includes("get-derivative-index")) return Response.json({ code: "200", success: true, data: [
        { indexCode: "H20955", indexNameCn: "红利低波100全收益", indexNameEn: "Dividend Low Volatility100 TRI" },
      ] });
      if (url.includes("searchapi.eastmoney.com")) return Response.json({ QuotationCodeTable: { Data: [] } });
      return Response.json({ quotes: [] });
    });

    await expect(searchPublicBenchmarks("红利低波100全收益", fetchMock)).resolves.toContainEqual({
      code: "H20955",
      name: "红利低波100全收益",
      market: "CN",
      source: "csindex",
      sourceSymbol: "H20955",
    });
  });

  test("validates an exact CSI H-code through the official endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("get-index-yield-item")) return Response.json({ code: "200", success: true, data: {
        indexCode: "H00300",
        indexNameCn: "300收益",
        indexNameEn: "CSI 300 TRI",
      } });
      if (url.includes("searchapi.eastmoney.com")) return Response.json({ QuotationCodeTable: { Data: [] } });
      if (url.includes("query1.finance.yahoo.com")) return Response.json({ quotes: [] });
      return Response.json({ code: "200", success: true, data: [] });
    });

    expect((await searchPublicBenchmarks("H00300", fetchMock))[0]).toEqual({
      code: "H00300",
      name: "300收益",
      market: "CN",
      source: "csindex",
      sourceSymbol: "H00300",
    });
  });

  test("removes an isolated 1990 CSI placeholder without dropping the continuous base date", () => {
    const points = sanitizeBenchmarkHistoryPoints([
      { date: new Date("1990-01-01T00:00:00Z"), closeValue: 1000 },
      { date: new Date("2004-12-31T00:00:00Z"), closeValue: 1000 },
      { date: new Date("2005-01-04T00:00:00Z"), closeValue: 981.56 },
    ]);
    expect(points.map((point) => point.date.toISOString().slice(0, 10))).toEqual(["2004-12-31", "2005-01-04"]);
  });

  test("validates query length and external response shape", async () => {
    await expect(searchPublicBenchmarks("A")).rejects.toMatchObject({ status: 400 });
    const fetchMock = vi.fn(async () => new Response("not-json", { status: 200 }));
    await expect(searchPublicBenchmarks("沪深", fetchMock)).rejects.toMatchObject({ status: 502 });
  });

  test("searches the public endpoint without relying on a live request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      return String(input).includes("searchapi.eastmoney.com")
        ? Response.json(payload)
        : Response.json({ quotes: [] });
    });
    const results = await searchPublicBenchmarks("沪深300", fetchMock);
    expect(results[0]).toMatchObject({ code: "000300", sourceSymbol: "1.000300" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("type=14");
  });

  test("accepts a valid source symbol and rejects arbitrary values", () => {
    expect(parseCreateBenchmarkInput({ code: "spx", market: "global", name: "标普500", sourceSymbol: "100.spx" })).toMatchObject({ code: "SPX", market: "GLOBAL", sourceSymbol: "100.SPX" });
    expect(parseCreateBenchmarkInput({ code: "spcllhcp", market: "global", name: "标普中国A股大盘红利低波50", sourceSymbol: "^spcllhcp" })).toMatchObject({ code: "SPCLLHCP", sourceSymbol: "^SPCLLHCP" });
    expect(() => parseCreateBenchmarkInput({ code: "SPX", market: "GLOBAL", name: "标普500", sourceSymbol: "bad symbol" })).toThrow("sourceSymbol 格式无效");
  });
});

import { describe, expect, test } from "vitest";
import { buildBenchmarkConstituentPresentation } from "@/lib/domain/benchmark-constituents";

describe("benchmark constituent presentation", () => {
  test("sorts constituents, compares the previous snapshot and groups industries", () => {
    const presentation = buildBenchmarkConstituentPresentation([
      { rank: 2, code: "300750", name: "宁德时代", exchange: "深圳证券交易所", industry: "工业", weightPercent: 3.88 },
      { rank: 1, code: "600519", name: "贵州茅台", exchange: "上海证券交易所", industry: "主要消费", weightPercent: 5.21 },
      { rank: 3, code: "000001", name: "平安银行", exchange: "深圳证券交易所", industry: "金融", weightPercent: 2.5 },
    ], [
      { rank: 1, code: "600519", name: "贵州茅台", exchange: "上海证券交易所", industry: "主要消费", weightPercent: 4.8 },
      { rank: 2, code: "300750", name: "宁德时代", exchange: "深圳证券交易所", industry: "工业", weightPercent: 4.1 },
    ], true);

    expect(presentation.rows.map((row) => row.code)).toEqual(["600519", "300750", "000001"]);
    expect(presentation.rows[0]?.change).toBeCloseTo(0.41, 10);
    expect(presentation.rows[0]?.changeKind).toBe("increase");
    expect(presentation.rows[1]?.change).toBeCloseTo(-0.22, 10);
    expect(presentation.rows[1]?.changeKind).toBe("decrease");
    expect(presentation.rows[2]).toMatchObject({ change: null, changeKind: "new" });
    expect(presentation.industries).toEqual([
      { name: "主要消费", weight: 5.21 },
      { name: "工业", weight: 3.88 },
      { name: "金融", weight: 2.5 },
    ]);
  });

  test("does not invent changes or industry weights from missing data", () => {
    const presentation = buildBenchmarkConstituentPresentation([
      { rank: 1, code: "600000", name: "浦发银行", exchange: null, industry: null, weightPercent: null },
    ], [], false);

    expect(presentation.rows[0]).toMatchObject({ change: null, changeKind: "unavailable" });
    expect(presentation.industries).toEqual([]);
  });
});

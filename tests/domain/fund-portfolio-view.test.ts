import { describe, expect, test } from "vitest";
import { buildPortfolioHoldingRows, buildTopTenIndustryAllocations, parseIndustryAllocations } from "@/lib/funds/portfolio-view";

describe("fund portfolio view", () => {
  test("sorts by current weight and calculates changes against the previous report", () => {
    const rows = buildPortfolioHoldingRows([
      { id: "b", code: "000002", name: "乙", weight: 8 },
      { id: "a", code: "000001", name: "甲", weight: 12 },
      { id: "c", code: null, name: "新进标的", weight: 3 },
      { id: "d", code: "000004", name: "缺数据", weight: null },
    ], [
      { id: "old-a", code: "000001", name: "甲旧名", weight: 10.5 },
      { id: "old-b", code: "000002", name: "乙", weight: 9 },
      { id: "old-d", code: "000004", name: "缺数据", weight: 2 },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
    expect(rows[0]).toMatchObject({ change: 1.5, changeKind: "increase" });
    expect(rows[1]).toMatchObject({ change: -1, changeKind: "decrease" });
    expect(rows[2]).toMatchObject({ change: null, changeKind: "new" });
    expect(rows[3]).toMatchObject({ change: null, changeKind: "unavailable" });
  });

  test("matches by name when no security code is available", () => {
    const rows = buildPortfolioHoldingRows(
      [{ id: "current", code: null, name: "信用债A", weight: 4.2 }],
      [{ id: "previous", code: null, name: "信用债A", weight: 4.2 }],
    );
    expect(rows[0]).toMatchObject({ change: 0, changeKind: "flat" });
  });

  test("does not label holdings as new when no previous report exists", () => {
    const rows = buildPortfolioHoldingRows(
      [{ id: "current", code: "000001", name: "首期持仓", weight: 4.2 }],
      [],
      false,
    );
    expect(rows[0]).toMatchObject({ change: null, changeKind: "unavailable" });
  });

  test("keeps only valid positive industry allocations", () => {
    expect(parseIndustryAllocations([
      { name: "食品饮料", weight: 20.1 },
      { name: "电子", weight: "12.5" },
      { name: "", weight: 4 },
      { name: "无效", weight: 0 },
    ])).toEqual([
      { name: "食品饮料", weight: 20.1 },
      { name: "电子", weight: 12.5 },
    ]);
    expect(parseIndustryAllocations(null)).toEqual([]);
  });

  test("groups CSI industries from the top ten disclosed stock holdings", () => {
    expect(buildTopTenIndustryAllocations([
      { rank: 1, weight: 8.5, industry: "主要消费" },
      { rank: 2, weight: 7, industry: "主要消费" },
      { rank: 3, weight: 6.25, industry: "信息技术" },
      { rank: 10, weight: 2.5, industry: "信息技术" },
      { rank: 11, weight: 9, industry: "金融" },
      { rank: 4, weight: null, industry: "工业" },
      { rank: 5, weight: 3, industry: null },
    ])).toEqual([
      { name: "主要消费", weight: 15.5 },
      { name: "信息技术", weight: 8.75 },
    ]);
  });
});

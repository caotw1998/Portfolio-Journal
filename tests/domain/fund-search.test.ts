import { describe, expect, test } from "vitest";
import { rankFundSearchResults } from "@/lib/funds/search";

const result = (code: string, name: string, establishedDate: string | null) => ({
  code,
  name,
  market: "CN_FUND",
  type: "指数型-股票",
  currency: "CNY",
  source: "eastmoney",
  establishedDate,
});

describe("fund search ordering", () => {
  test("sorts by relevance before earliest establishment date", () => {
    const results = [
      result("000002", "红利低波增强", "2010-01-01"),
      result("000001", "红利低波", "2020-01-01"),
      result("000003", "华泰红利低波", "2005-01-01"),
      result("000004", "红利低波联接", null),
      result("红利低波", "不相关基金", "2000-01-01"),
    ];

    expect(rankFundSearchResults(results, "红利低波").map((item) => item.code)).toEqual([
      "红利低波",
      "000001",
      "000002",
      "000004",
      "000003",
    ]);
  });

  test("puts missing establishment dates last within the same relevance tier", () => {
    const results = [
      result("000002", "红利低波B", null),
      result("000001", "红利低波A", "2018-12-19"),
    ];
    expect(rankFundSearchResults(results, "红利低波").map((item) => item.code)).toEqual(["000001", "000002"]);
  });
});

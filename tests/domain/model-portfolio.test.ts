import { describe, expect, test } from "vitest";
import { backtestModelPortfolio, searchLibraryFunds } from "@/lib/funds/model-portfolio";

describe("model portfolio backtest", () => {
  const fundA = { id: "a", name: "A", targetWeight: 0.6, points: [{ date: "2025-01-01", value: 1 }, { date: "2025-04-01", value: 1.2 }, { date: "2025-07-01", value: 1.1 }] };
  const fundB = { id: "b", name: "B", targetWeight: 0.3, points: [{ date: "2025-02-01", value: 2 }, { date: "2025-04-02", value: 2.2 }, { date: "2025-07-02", value: 2.4 }] };

  test("starts only after every fund has an observation and keeps residual cash", () => {
    const result = backtestModelPortfolio({ allocations: [fundA, fundB], startDate: "2025-01-01", rebalanceFrequency: "none", transactionCostBps: 0, cashAnnualReturn: 0 });
    expect(result.actualStartDate).toBe("2025-02-01");
    expect(result.points[0]).toMatchObject({ date: "2025-02-01", value: 1 });
    expect(result.contributions.reduce((sum, item) => sum + item.endingWeight, 0)).toBeLessThan(1);
  });

  test("rebalances on the first valid date after a quarter boundary and deducts costs", () => {
    const free = backtestModelPortfolio({ allocations: [fundA, fundB], startDate: "2025-01-01", rebalanceFrequency: "quarterly", transactionCostBps: 0, cashAnnualReturn: 0 });
    const costly = backtestModelPortfolio({ allocations: [fundA, fundB], startDate: "2025-01-01", rebalanceFrequency: "quarterly", transactionCostBps: 100, cashAnnualReturn: 0 });
    expect(costly.turnover).toBeGreaterThan(0);
    expect(costly.points.at(-1)!.value).toBeLessThan(free.points.at(-1)!.value);
  });

  test("searches unselected research funds by name or code without listing everything", () => {
    const funds = [
      { id: "a", code: "000001", name: "华夏成长" },
      { id: "b", code: "110022", name: "易方达消费行业" },
      { id: "c", code: "040046", name: "华安纳斯达克" },
    ];
    expect(searchLibraryFunds(funds, "", new Set())).toEqual([]);
    expect(searchLibraryFunds(funds, "110", new Set()).map((item) => item.id)).toEqual(["b"]);
    expect(searchLibraryFunds(funds, "华", new Set(["a"])).map((item) => item.id)).toEqual(["c"]);
  });
});

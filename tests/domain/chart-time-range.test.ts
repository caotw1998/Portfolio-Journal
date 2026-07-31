import { describe, expect, test } from "vitest";
import {
  A_SHARE_MARKET_CYCLE_OPTIONS,
  resolveFixedRange,
  resolveFixedStartRange,
} from "@/lib/chart-time-range";

describe("chart market cycle ranges", () => {
  test("exposes the approved A-share cycle anchors", () => {
    expect(A_SHARE_MARKET_CYCLE_OPTIONS).toHaveLength(9);
    expect(A_SHARE_MARKET_CYCLE_OPTIONS[0]).toEqual({ id: "a-share-market-2024", label: "2024 行情", kind: "market", from: "2024-09-24", to: null });
    expect(A_SHARE_MARKET_CYCLE_OPTIONS[1]).toEqual({ id: "a-share-bear-2021", label: "2021—2024 熊市", kind: "bear", from: "2021-02-18", to: "2024-09-24" });
    expect(A_SHARE_MARKET_CYCLE_OPTIONS.at(-1)).toEqual({ id: "a-share-bull-2005", label: "2005—2007 牛市", kind: "bull", from: "2005-06-06", to: "2007-10-16" });
    expect(A_SHARE_MARKET_CYCLE_OPTIONS.map((cycle) => cycle.from))
      .toEqual([...A_SHARE_MARKET_CYCLE_OPTIONS.map((cycle) => cycle.from)].sort().reverse());
  });

  test("uses both boundaries for a closed market cycle and clamps to coverage", () => {
    expect(resolveFixedRange({ from: "2019-01-04", to: "2021-02-18" }, { from: "2010-01-01", to: "2026-07-21" })).toEqual({
      range: { from: "2019-01-04", to: "2021-02-18" },
      clampedFrom: false,
      clampedTo: false,
    });
    expect(resolveFixedRange({ from: "2019-01-04", to: "2021-02-18" }, { from: "2020-01-01", to: "2020-12-31" })).toEqual({
      range: { from: "2020-01-01", to: "2020-12-31" },
      clampedFrom: true,
      clampedTo: true,
    });
    expect(resolveFixedRange({ from: "2024-09-24", to: null }, { from: "2020-01-01", to: "2026-07-21" }).range).toEqual({ from: "2024-09-24", to: "2026-07-21" });
  });

  test("uses the fixed cycle start and clamps it to fund inception", () => {
    expect(resolveFixedStartRange("2014-07-21", { from: "2010-01-01", to: "2026-07-21" })).toEqual({
      range: { from: "2014-07-21", to: "2026-07-21" },
      clampedToAvailableStart: false,
    });
    expect(resolveFixedStartRange("2014-07-21", { from: "2020-01-02", to: "2026-07-21" })).toEqual({
      range: { from: "2020-01-02", to: "2026-07-21" },
      clampedToAvailableStart: true,
    });
  });
});

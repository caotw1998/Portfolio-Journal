import { describe, expect, test } from "vitest";
import {
  A_SHARE_MARKET_CYCLE_OPTIONS,
  resolveFixedStartRange,
} from "@/lib/chart-time-range";

describe("chart market cycle ranges", () => {
  test("exposes the approved A-share cycle anchors", () => {
    expect(A_SHARE_MARKET_CYCLE_OPTIONS).toEqual([
      { id: "a-share-2005", label: "2005牛市", from: "2005-06-06" },
      { id: "a-share-2008", label: "2008牛市", from: "2008-10-28" },
      { id: "a-share-2014", label: "2014牛市", from: "2014-07-21" },
      { id: "a-share-2019", label: "2019牛市", from: "2019-01-04" },
      { id: "a-share-2024", label: "2024行情", from: "2024-09-24" },
    ]);
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

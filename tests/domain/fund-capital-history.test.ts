import { describe, expect, test } from "vitest";
import {
  buildCapitalHistoryPeriods,
  resolveLatestDisclosedSnapshot,
  selectCapitalHistoryPage,
} from "@/lib/funds/capital-history";

describe("fund capital history", () => {
  const snapshots = [
    { reportDate: "2025-06-30", value: 40.4 },
    { reportDate: "2025-12-31", value: 35.63 },
  ];

  test("uses the latest disclosed snapshot that is not after the selected date", () => {
    expect(resolveLatestDisclosedSnapshot(snapshots, "2026-06-30"))
      .toEqual({ reportDate: "2025-12-31", value: 35.63 });
    expect(resolveLatestDisclosedSnapshot(snapshots, "2025-09-30"))
      .toEqual({ reportDate: "2025-06-30", value: 40.4 });
  });

  test("never backfills from a future disclosure", () => {
    expect(resolveLatestDisclosedSnapshot(snapshots, "2025-03-31")).toBeNull();
    expect(resolveLatestDisclosedSnapshot([], "2026-06-30")).toBeNull();
  });

  test("builds all periods in chronological order without inventing values", () => {
    const periods = buildCapitalHistoryPeriods({
      scaleSnapshots: [
        { reportDate: "2026-06-30T00:00:00.000Z", netAssets: 12.5, shares: 8.2 },
        { reportDate: "2025-12-31T00:00:00.000Z", netAssets: 10.25, shares: 7.8 },
        { reportDate: "2024-12-31T00:00:00.000Z", netAssets: 9.4, shares: 7.1 },
      ],
      flowSnapshots: [
        { reportDate: "2026-06-30", subscriptions: 2.5, redemptions: 1.25, totalShares: 8.2 },
        { reportDate: "2025-12-31", subscriptions: 0.5, redemptions: 1, totalShares: 7.8 },
      ],
      holderSnapshots: [
        { reportDate: "2025-12-31", institutionPercent: 35.63, individualPercent: 64.35, internalPercent: 0.02 },
        { reportDate: "2025-06-30", institutionPercent: 40.4, individualPercent: 59.57, internalPercent: 0.03 },
      ],
    });

    expect(periods.map((period) => period.reportDate)).toEqual([
      "2024-12-31",
      "2025-06-30",
      "2025-12-31",
      "2026-06-30",
    ]);
    expect(periods[1]).toMatchObject({ netAssets: null, subscriptions: null, holderDisclosedAt: "2025-06-30" });
    expect(periods[2]).toMatchObject({ netSubscriptions: -0.5, holderDisclosedAt: "2025-12-31" });
    expect(periods[3]).toMatchObject({ holderDisclosedAt: "2025-12-31" });
    expect(periods[3]?.holderStack?.institution).toBeCloseTo(35.63);
    expect(periods[3]?.holderStack?.individual).toBeCloseTo(64.35);
    expect(periods[3]?.holderStack?.internal).toBeCloseTo(0.02);
  });

  test("pages capital history from newest to oldest in chronological groups of three", () => {
    const periods = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"];
    expect(selectCapitalHistoryPage(periods, 0)).toEqual(["Q5", "Q6", "Q7"]);
    expect(selectCapitalHistoryPage(periods, 1)).toEqual(["Q2", "Q3", "Q4"]);
    expect(selectCapitalHistoryPage(periods, 2)).toEqual(["Q1"]);
    expect(selectCapitalHistoryPage(periods, 3)).toEqual([]);
  });

  test("normalizes holder percentages for a 100 percent stack and keeps missing disclosure empty", () => {
    const periods = buildCapitalHistoryPeriods({
      scaleSnapshots: [
        { reportDate: "2025-03-31", netAssets: 8, shares: null },
        { reportDate: "2025-06-30", netAssets: 9, shares: null },
      ],
      flowSnapshots: [],
      holderSnapshots: [
        { reportDate: "2025-06-30", institutionPercent: 30, individualPercent: 60, internalPercent: 5 },
      ],
    });

    expect(periods[0]?.holderStack).toBeNull();
    expect(periods[1]?.holderStack).toEqual({
      institution: 31.57894736842105,
      individual: 63.1578947368421,
      internal: 5.263157894736842,
    });
  });
});

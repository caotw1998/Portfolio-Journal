import { describe, expect, test } from "vitest";
import { resolveLatestDisclosedSnapshot } from "@/lib/funds/capital-history";

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
});

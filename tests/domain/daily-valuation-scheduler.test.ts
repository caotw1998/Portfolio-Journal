import { describe, expect, test } from "vitest";
import { shouldRunDailyValuationSync } from "@/script/daily-valuation-scheduler.mjs";

describe("daily valuation scheduler", () => {
  test("starts at 20:30 Beijing on weekdays and retries after 15 minutes", () => {
    expect(shouldRunDailyValuationSync({ now: new Date("2026-08-24T12:29:00Z"), lastSuccessDate: null, lastAttemptAt: null })).toBe(false);
    expect(shouldRunDailyValuationSync({ now: new Date("2026-08-24T12:30:00Z"), lastSuccessDate: null, lastAttemptAt: null })).toBe(true);
    expect(shouldRunDailyValuationSync({ now: new Date("2026-08-24T12:40:00Z"), lastSuccessDate: null, lastAttemptAt: new Date("2026-08-24T12:30:00Z") })).toBe(false);
    expect(shouldRunDailyValuationSync({ now: new Date("2026-08-24T12:45:00Z"), lastSuccessDate: null, lastAttemptAt: new Date("2026-08-24T12:30:00Z") })).toBe(true);
    expect(shouldRunDailyValuationSync({ now: new Date("2026-08-24T13:00:00Z"), lastSuccessDate: "2026-08-24", lastAttemptAt: null })).toBe(false);
  });

  test("does not run on weekends", () => {
    expect(shouldRunDailyValuationSync({ now: new Date("2026-08-22T13:00:00Z"), lastSuccessDate: null, lastAttemptAt: null })).toBe(false);
  });
});

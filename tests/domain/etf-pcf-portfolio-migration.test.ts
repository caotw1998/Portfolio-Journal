import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("prisma/migrations/20260803223000_add_etf_pcf_portfolio_metrics/migration.sql", "utf8");

describe("ETF PCF portfolio metrics migration", () => {
  test("adds nullable reference value and basket weight columns", () => {
    expect(migration).toContain('ADD COLUMN "referencePrice" DECIMAL(20,8)');
    expect(migration).toContain('ADD COLUMN "referencePriceDate" DATE');
    expect(migration).toContain('ADD COLUMN "referencePriceSource" TEXT');
    expect(migration).toContain('ADD COLUMN "referenceValue" DECIMAL(24,4)');
    expect(migration).toContain('ADD COLUMN "basketWeight" DECIMAL(12,8)');
  });
});

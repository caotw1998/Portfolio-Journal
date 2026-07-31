import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("prisma/migrations/20260730134500_add_stock_industry_classification/migration.sql", "utf8");

describe("stock industry migration", () => {
  test("creates a source-aware classification cache", () => {
    expect(migration).toContain('CREATE TABLE "StockIndustryClassification"');
    expect(migration).toContain('"industry" TEXT');
    expect(migration).toContain('"source" TEXT');
    expect(migration).toContain('"lastSuccessAt" TIMESTAMP(3)');
  });
});

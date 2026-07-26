import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("prisma/migrations/20260719210000_fund_research_system/migration.sql", "utf8");

describe("fund research migration", () => {
  test("migrates followed funds before dropping ledger tables", () => {
    expect(migration.indexOf('CREATE TEMP TABLE "_FundMigrationUser"')).toBeLessThan(migration.indexOf('DROP TABLE "HoldingSnapshot"'));
    expect(migration).toContain('ALTER TABLE "Asset" RENAME TO "Fund"');
    expect(migration).toContain('ALTER TABLE "AssetPriceSnapshot" RENAME TO "FundNavSnapshot"');
    expect(migration).toContain('ALTER TABLE "FundDetailCache" RENAME TO "FundSourceSnapshot"');
  });

  test.each(["Portfolio", "HoldingSnapshot", "Transaction", "DailyPerformance", "PortfolioRecalcQueue", "MarketDataSyncJob", "CodexIngestionLog"])("drops the %s ledger table", (table) => {
    expect(migration).toContain(`DROP TABLE "${table}"`);
  });
});

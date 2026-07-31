import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("prisma/migrations/20260728205000_add_etf_pcf/migration.sql", "utf8");

describe("ETF PCF migration", () => {
  test("adds daily snapshots and component rows with stable uniqueness", () => {
    expect(migration).toContain('CREATE TABLE "EtfPcfSnapshot"');
    expect(migration).toContain('CREATE TABLE "EtfPcfComponent"');
    expect(migration).toContain('"EtfPcfSnapshot_fundId_tradingDay_key"');
    expect(migration).toContain('"EtfPcfComponent_snapshotId_instrumentCode_key"');
  });

  test("cascades ETF PCF data with its owning fund and snapshot", () => {
    expect(migration).toContain('"EtfPcfSnapshot_fundId_fkey"');
    expect(migration).toContain('"EtfPcfComponent_snapshotId_fkey"');
    expect(migration.match(/ON DELETE CASCADE/g)).toHaveLength(2);
  });
});

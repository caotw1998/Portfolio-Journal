import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("prisma/migrations/20260720214500_expand_fund_research_data/migration.sql", "utf8");

describe("expanded fund research data migration", () => {
  test.each([
    "fullName",
    "custodian",
    "issueDate",
    "establishedShares",
    "managementFeeRate",
    "custodianFeeRate",
    "salesServiceFeeRate",
    "trackingTarget",
    "investmentObjective",
    "investmentScope",
    "investmentStrategy",
    "dividendPolicy",
    "riskReturnCharacteristics",
  ])("adds the %s fund profile column", (column) => {
    expect(migration).toContain(`ADD COLUMN "${column}"`);
  });

  test("adds disclosed holding quantity", () => {
    expect(migration).toContain('ALTER TABLE "FundHolding"');
    expect(migration).toContain('ADD COLUMN "quantity" DECIMAL(24,4)');
  });
});

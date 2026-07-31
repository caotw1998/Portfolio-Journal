import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("prisma/migrations/20260726151500_add_benchmark_source_symbol/migration.sql", "utf8");

describe("benchmark search migration", () => {
  test("adds a nullable source symbol without rewriting existing rows", () => {
    expect(migration).toContain('ALTER TABLE "BenchmarkInstrument"');
    expect(migration).toContain('ADD COLUMN "sourceSymbol" TEXT');
    expect(migration).not.toContain("NOT NULL");
    expect(migration).not.toContain("DEFAULT");
  });
});

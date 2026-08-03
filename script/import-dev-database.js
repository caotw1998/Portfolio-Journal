/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const snapshotPath = process.argv[2] ?? path.join(process.cwd(), "data", "fund-research.snapshot.json");
  if (!fs.existsSync(snapshotPath)) throw new Error(`Snapshot file not found: ${snapshotPath}`);
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  if (snapshot.version !== 2 || snapshot.kind !== "fund-research") throw new Error("Unsupported snapshot format.");
  const tables = snapshot.tables ?? {};
  const prisma = new PrismaClient();
  await prisma.$transaction(async (tx) => {
    if (process.argv.includes("--replace")) {
      await tx.auditLog.deleteMany();
      await tx.fundHolding.deleteMany();
      await tx.fundPortfolioReport.deleteMany();
      await tx.fundScaleSnapshot.deleteMany();
      await tx.fundManagerTenure.deleteMany();
      await tx.fundNavSnapshot.deleteMany();
      await tx.fundSourceSnapshot.deleteMany();
      await tx.userFund.deleteMany();
      await tx.benchmarkPriceSnapshot.deleteMany();
      await tx.benchmarkValuationSnapshot.deleteMany();
      await tx.benchmarkInstrument.deleteMany();
      await tx.fund.deleteMany();
      await tx.session.deleteMany();
      await tx.user.deleteMany();
    }
    const insert = async (model, rows) => { if (rows?.length) await model.createMany({ data: rows, skipDuplicates: true }); };
    await insert(tx.user, tables.users);
    await insert(tx.fund, tables.funds);
    await insert(tx.benchmarkInstrument, tables.benchmarkInstruments);
    await insert(tx.userFund, tables.userFunds);
    await insert(tx.fundNavSnapshot, tables.fundNavSnapshots);
    await insert(tx.fundManagerTenure, tables.fundManagerTenures);
    await insert(tx.fundPortfolioReport, tables.fundPortfolioReports);
    await insert(tx.fundHolding, tables.fundHoldings);
    await insert(tx.fundScaleSnapshot, (tables.fundScaleSnapshots ?? []).map((row) => ({ ...row, holderCount: row.holderCount === null ? null : BigInt(row.holderCount) })));
    await insert(tx.fundSourceSnapshot, tables.fundSourceSnapshots);
    await insert(tx.benchmarkPriceSnapshot, tables.benchmarkPriceSnapshots);
    await insert(tx.benchmarkValuationSnapshot, tables.benchmarkValuationSnapshots);
    await insert(tx.auditLog, tables.auditLogs);
  });
  await prisma.$disconnect();
  process.stdout.write(`Imported fund research snapshot from ${snapshotPath}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });

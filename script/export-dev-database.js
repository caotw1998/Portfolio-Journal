/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const targetPath = process.argv[2] ?? path.join(process.cwd(), "data", "fund-research.snapshot.json");
  const prisma = new PrismaClient();
  const [users, funds, userFunds, fundNavSnapshots, fundManagerTenures, fundPortfolioReports, fundHoldings, fundScaleSnapshots, fundSourceSnapshots, benchmarkInstruments, benchmarkPriceSnapshots, auditLogs] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.fund.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.userFund.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.fundNavSnapshot.findMany({ orderBy: { valuationDate: "asc" } }),
    prisma.fundManagerTenure.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.fundPortfolioReport.findMany({ orderBy: { reportDate: "asc" } }),
    prisma.fundHolding.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.fundScaleSnapshot.findMany({ orderBy: { reportDate: "asc" } }),
    prisma.fundSourceSnapshot.findMany({ orderBy: { fetchedAt: "asc" } }),
    prisma.benchmarkInstrument.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.benchmarkPriceSnapshot.findMany({ orderBy: { date: "asc" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const snapshot = { version: 2, kind: "fund-research", exportedAt: new Date().toISOString(), tables: { users, funds, userFunds, fundNavSnapshots, fundManagerTenures, fundPortfolioReports, fundHoldings, fundScaleSnapshots, fundSourceSnapshots, benchmarkInstruments, benchmarkPriceSnapshots, auditLogs } };
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(snapshot, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`);
  await prisma.$disconnect();
  process.stdout.write(`Exported fund research snapshot to ${targetPath}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });

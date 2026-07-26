function databaseNameFromUrl(databaseUrl: string) {
  try { return new URL(databaseUrl).pathname.replace(/^\//, ""); } catch { return ""; }
}

export function assertSafeTestDatabase() {
  const databaseName = databaseNameFromUrl(process.env.DATABASE_URL ?? "");
  if (!databaseName || !["_integration", "_e2e", "_test"].some((suffix) => databaseName.endsWith(suffix))) {
    throw new Error(`Refusing to run against non-test database "${databaseName}".`);
  }
}

export function createUniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function resetDatabase() {
  assertSafeTestDatabase();
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(), prisma.fundHolding.deleteMany(), prisma.fundPortfolioReport.deleteMany(),
    prisma.fundScaleSnapshot.deleteMany(), prisma.fundManagerTenure.deleteMany(), prisma.fundNavSnapshot.deleteMany(),
    prisma.fundSourceSnapshot.deleteMany(), prisma.userFund.deleteMany(), prisma.benchmarkPriceSnapshot.deleteMany(),
    prisma.benchmarkInstrument.deleteMany(), prisma.fund.deleteMany(), prisma.session.deleteMany(), prisma.user.deleteMany(),
  ]);
}

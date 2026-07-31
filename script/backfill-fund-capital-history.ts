import { PrismaClient } from "@prisma/client";
import { createEastmoneyFundProvider } from "../lib/funds/providers/eastmoney";

const prisma = new PrismaClient();
const provider = createEastmoneyFundProvider();

async function backfillFund(fund: { id: string; code: string }) {
  const [scale, flows, holders] = await Promise.all([
    provider.scale(fund.code),
    provider.flows(fund.code),
    provider.holders(fund.code),
  ]);
  if (!scale.data.length || !flows.data.length || !holders.data.length) {
    throw new Error(`历史数据不完整：规模 ${scale.data.length}，申赎 ${flows.data.length}，持有人 ${holders.data.length}`);
  }

  await prisma.$transaction(async (transaction) => {
    for (const point of scale.data) {
      const reportDate = new Date(`${point.reportDate}T00:00:00Z`);
      await transaction.fundScaleSnapshot.upsert({
        where: { fundId_reportDate: { fundId: fund.id, reportDate } },
        create: { fundId: fund.id, reportDate, netAssets: point.netAssets, shares: point.shares, holderCount: point.holderCount, source: provider.source },
        update: { netAssets: point.netAssets, shares: point.shares, holderCount: point.holderCount, source: provider.source },
      });
    }
    for (const point of flows.data) {
      const reportDate = new Date(`${point.reportDate}T00:00:00Z`);
      await transaction.fundFlowSnapshot.upsert({
        where: { fundId_reportDate: { fundId: fund.id, reportDate } },
        create: { fundId: fund.id, reportDate, subscriptions: point.subscriptions, redemptions: point.redemptions, totalShares: point.totalShares, source: provider.source },
        update: { subscriptions: point.subscriptions, redemptions: point.redemptions, totalShares: point.totalShares, source: provider.source },
      });
    }
    for (const point of holders.data) {
      const reportDate = new Date(`${point.reportDate}T00:00:00Z`);
      await transaction.fundHolderSnapshot.upsert({
        where: { fundId_reportDate: { fundId: fund.id, reportDate } },
        create: { fundId: fund.id, reportDate, institutionPercent: point.institutionPercent, individualPercent: point.individualPercent, internalPercent: point.internalPercent, source: provider.source },
        update: { institutionPercent: point.institutionPercent, individualPercent: point.individualPercent, internalPercent: point.internalPercent, source: provider.source },
      });
    }
  });

  return {
    code: fund.code,
    scaleCount: scale.data.length,
    scaleFirst: scale.data.at(-1)?.reportDate ?? null,
    flowCount: flows.data.length,
    holderCount: holders.data.length,
    holderFirst: holders.data.at(-1)?.reportDate ?? null,
  };
}

async function main() {
  const followedFunds = await prisma.userFund.findMany({
    distinct: ["fundId"],
    orderBy: { fund: { code: "asc" } },
    select: { fund: { select: { id: true, code: true } } },
  });
  const failures: Array<{ code: string; error: string }> = [];

  for (let index = 0; index < followedFunds.length; index += 2) {
    const batch = followedFunds.slice(index, index + 2);
    const results = await Promise.all(batch.map(async ({ fund }) => {
      try {
        return await backfillFund(fund);
      } catch (error) {
        failures.push({ code: fund.code, error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    }));
    for (const result of results) {
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  }

  process.stdout.write(`${JSON.stringify({ total: followedFunds.length, succeeded: followedFunds.length - failures.length, failures })}\n`);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

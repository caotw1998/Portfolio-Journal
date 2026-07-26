import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { backtestModelPortfolio, type RebalanceFrequency } from "@/lib/funds/model-portfolio";
import { buildDividendAdjustedSeries, calculateSeriesMetrics } from "@/lib/funds/metrics";

type PortfolioInput = {
  name?: unknown;
  description?: unknown;
  startDate?: unknown;
  benchmarkId?: unknown;
  rebalanceFrequency?: unknown;
  transactionCostBps?: unknown;
  cashAnnualReturn?: unknown;
  allocations?: unknown;
};

const frequencies = new Set<RebalanceFrequency>(["none", "monthly", "quarterly", "annual"]);

async function validateInput(userId: string, input: PortfolioInput) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const startDate = typeof input.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : "";
  const frequency = frequencies.has(input.rebalanceFrequency as RebalanceFrequency) ? input.rebalanceFrequency as RebalanceFrequency : "quarterly";
  const allocations = Array.isArray(input.allocations) ? input.allocations.flatMap((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const fundId = typeof record.fundId === "string" ? record.fundId : "";
    const targetWeight = Number(record.targetWeight);
    return fundId && Number.isFinite(targetWeight) ? [{ fundId, targetWeight }] : [];
  }) : [];
  if (!name || name.length > 80) throw new ApiError("组合名称为必填，且不能超过 80 字。", 400);
  if (!startDate) throw new ApiError("请选择有效起始日期。", 400);
  if (allocations.length < 1 || allocations.length > 20 || new Set(allocations.map((item) => item.fundId)).size !== allocations.length) throw new ApiError("请选择 1 至 20 只不重复的研究库基金。", 400);
  const totalWeight = allocations.reduce((sum, item) => sum + item.targetWeight, 0);
  if (allocations.some((item) => item.targetWeight <= 0 || item.targetWeight > 1) || totalWeight > 1.00000001) throw new ApiError("目标权重需大于 0，合计不超过 100%。", 400);
  const followed = await prisma.userFund.count({ where: { userId, fundId: { in: allocations.map((item) => item.fundId) } } });
  if (followed !== allocations.length) throw new ApiError("组合只能使用研究库中的基金。", 403);
  const transactionCostBps = Number(input.transactionCostBps ?? 0);
  const cashAnnualReturn = Number(input.cashAnnualReturn ?? 0);
  if (!Number.isFinite(transactionCostBps) || transactionCostBps < 0 || transactionCostBps > 1000) throw new ApiError("交易成本需在 0 至 1000 基点之间。", 400);
  if (!Number.isFinite(cashAnnualReturn) || cashAnnualReturn < -1 || cashAnnualReturn > 1) throw new ApiError("现金年化收益需在 -100% 至 100% 之间。", 400);
  return { name, description: typeof input.description === "string" ? input.description.trim() || null : null, startDate, benchmarkId: typeof input.benchmarkId === "string" && input.benchmarkId ? input.benchmarkId : null, frequency, transactionCostBps, cashAnnualReturn, allocations };
}

const portfolioInclude = { allocations: { include: { fund: { select: { id: true, code: true, name: true } } }, orderBy: { createdAt: "asc" as const } } };

export function listModelPortfolios(userId: string) {
  return prisma.modelPortfolio.findMany({ where: { userId }, include: portfolioInclude, orderBy: { updatedAt: "desc" } });
}

export async function getModelPortfolio(userId: string, id: string) {
  const portfolio = await prisma.modelPortfolio.findFirst({ where: { id, userId }, include: portfolioInclude });
  if (!portfolio) throw new ApiError("模拟组合不存在。", 404);
  return portfolio;
}

export async function createModelPortfolio(userId: string, input: PortfolioInput) {
  const value = await validateInput(userId, input);
  return prisma.modelPortfolio.create({ data: { userId, name: value.name, description: value.description, startDate: new Date(`${value.startDate}T00:00:00Z`), benchmarkId: value.benchmarkId, rebalanceFrequency: value.frequency, transactionCostBps: value.transactionCostBps, cashAnnualReturn: value.cashAnnualReturn, allocations: { create: value.allocations } }, include: portfolioInclude });
}

export async function updateModelPortfolio(userId: string, id: string, input: PortfolioInput) {
  await getModelPortfolio(userId, id);
  const value = await validateInput(userId, input);
  return prisma.$transaction(async (transaction) => {
    await transaction.modelPortfolioAllocation.deleteMany({ where: { modelPortfolioId: id } });
    return transaction.modelPortfolio.update({ where: { id }, data: { name: value.name, description: value.description, startDate: new Date(`${value.startDate}T00:00:00Z`), benchmarkId: value.benchmarkId, rebalanceFrequency: value.frequency, transactionCostBps: value.transactionCostBps, cashAnnualReturn: value.cashAnnualReturn, allocations: { create: value.allocations } }, include: portfolioInclude });
  });
}

export async function deleteModelPortfolio(userId: string, id: string) {
  await getModelPortfolio(userId, id);
  await prisma.modelPortfolio.delete({ where: { id } });
}

export async function backtestStoredPortfolio(userId: string, id: string) {
  const portfolio = await prisma.modelPortfolio.findFirst({ where: { id, userId }, include: { allocations: { include: { fund: { include: { navSnapshots: { orderBy: { valuationDate: "asc" } }, dividendEvents: { orderBy: { exDate: "asc" } } } } } } } });
  if (!portfolio) throw new ApiError("模拟组合不存在。", 404);
  const result = backtestModelPortfolio({
    startDate: portfolio.startDate.toISOString().slice(0, 10),
    rebalanceFrequency: portfolio.rebalanceFrequency as RebalanceFrequency,
    transactionCostBps: portfolio.transactionCostBps.toNumber(),
    cashAnnualReturn: portfolio.cashAnnualReturn.toNumber(),
    allocations: portfolio.allocations.map((allocation) => {
      const dividendsByDate = new Map<string, number>();
      for (const event of allocation.fund.dividendEvents) {
        if (!event.exDate || !event.amount) continue;
        const date = event.exDate.toISOString().slice(0, 10);
        dividendsByDate.set(date, (dividendsByDate.get(date) ?? 0) + event.amount.toNumber());
      }
      return {
        id: allocation.fundId,
        name: allocation.fund.name ?? allocation.fund.code,
        targetWeight: allocation.targetWeight.toNumber(),
        points: buildDividendAdjustedSeries(allocation.fund.navSnapshots.map((point) => {
          const date = point.valuationDate.toISOString().slice(0, 10);
          return {
            date,
            unitNav: point.unitNav.toNumber(),
            dailyReturn: point.dailyReturn?.toNumber() ?? null,
            dividendAmount: dividendsByDate.get(date) ?? 0,
          };
        })),
      };
    }),
  });
  let benchmark = null;
  if (portfolio.benchmarkId) {
    const instrument = await prisma.benchmarkInstrument.findFirst({ where: { id: portfolio.benchmarkId, userId }, include: { priceSnapshots: { where: { date: { gte: new Date(`${result.actualStartDate}T00:00:00Z`) } }, orderBy: { date: "asc" } } } });
    if (instrument && instrument.priceSnapshots.length > 1) {
      const first = instrument.priceSnapshots[0]!.closeValue.toNumber();
      const points = instrument.priceSnapshots.map((point) => ({ date: point.date.toISOString().slice(0, 10), value: point.closeValue.toNumber() / first }));
      const metrics = calculateSeriesMetrics(points);
      benchmark = { id: instrument.id, name: instrument.name, points, metrics, excessTotalReturn: result.metrics.totalReturn === null || metrics.totalReturn === null ? null : result.metrics.totalReturn - metrics.totalReturn };
    }
  }
  return JSON.parse(JSON.stringify({ portfolio: { id: portfolio.id, name: portfolio.name }, ...result, benchmark }, (_key, value) => value instanceof Prisma.Decimal ? value.toNumber() : value));
}

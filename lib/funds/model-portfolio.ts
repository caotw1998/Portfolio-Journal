import { calculateSeriesMetrics, type ValuePoint } from "@/lib/funds/metrics";
import { searchLibraryOptions } from "@/lib/funds/library-search";

export type BacktestAllocation = { id: string; name: string; targetWeight: number; points: ValuePoint[] };
export type RebalanceFrequency = "none" | "monthly" | "quarterly" | "annual";
export type LibraryFundOption = { id: string; code: string; name: string };

export function searchLibraryFunds(funds: LibraryFundOption[], query: string, selectedIds: Set<string>, limit = 8) {
  return searchLibraryOptions(funds, query, selectedIds, limit);
}

function periodKey(date: string, frequency: RebalanceFrequency) {
  const [year, month] = date.split("-").map(Number);
  if (frequency === "monthly") return `${year}-${month}`;
  if (frequency === "quarterly") return `${year}-Q${Math.ceil(month! / 3)}`;
  if (frequency === "annual") return String(year);
  return "none";
}

export function backtestModelPortfolio(input: {
  allocations: BacktestAllocation[];
  startDate: string;
  rebalanceFrequency: RebalanceFrequency;
  transactionCostBps: number;
  cashAnnualReturn: number;
}) {
  if (!input.allocations.length || input.allocations.length > 20) throw new Error("模拟组合需包含 1 至 20 只基金。");
  const totalWeight = input.allocations.reduce((sum, item) => sum + item.targetWeight, 0);
  if (input.allocations.some((item) => item.targetWeight <= 0) || totalWeight > 1.00000001) throw new Error("目标权重必须大于 0，且合计不超过 100%。");
  const normalized = input.allocations.map((allocation) => ({ ...allocation, points: allocation.points.filter((point) => point.date >= input.startDate).sort((a, b) => a.date.localeCompare(b.date)) }));
  if (normalized.some((allocation) => allocation.points.length === 0)) throw new Error("部分基金在起始日之后没有净值数据。");
  const actualStartDate = normalized.reduce((latest, allocation) => allocation.points[0]!.date > latest ? allocation.points[0]!.date : latest, input.startDate);
  const dates = Array.from(new Set(normalized.flatMap((allocation) => allocation.points.map((point) => point.date)).filter((date) => date >= actualStartDate))).sort();
  const indexes = new Map(normalized.map((allocation) => [allocation.id, 0]));
  const latestValues = new Map<string, number>();
  const units = new Map<string, number>();
  let cash = 1 - totalWeight;
  let previousDate = actualStartDate;
  let previousPeriod = periodKey(actualStartDate, input.rebalanceFrequency);
  let turnover = 0;
  const points: Array<{ date: string; value: number; drawdown: number }> = [];
  let peak = 1;

  for (const date of dates) {
    for (const allocation of normalized) {
      let index = indexes.get(allocation.id)!;
      while (index < allocation.points.length && allocation.points[index]!.date <= date) {
        latestValues.set(allocation.id, allocation.points[index]!.value);
        index += 1;
      }
      indexes.set(allocation.id, index);
    }
    if (latestValues.size !== normalized.length) continue;
    const elapsedDays = Math.max(0, (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${previousDate}T00:00:00Z`).getTime()) / 86_400_000);
    cash *= Math.pow(1 + input.cashAnnualReturn, elapsedDays / 365.25);
    if (!units.size) {
      for (const allocation of normalized) units.set(allocation.id, allocation.targetWeight / latestValues.get(allocation.id)!);
    }
    let totalValue = cash + normalized.reduce((sum, allocation) => sum + units.get(allocation.id)! * latestValues.get(allocation.id)!, 0);
    const currentPeriod = periodKey(date, input.rebalanceFrequency);
    if (input.rebalanceFrequency !== "none" && currentPeriod !== previousPeriod) {
      const tradedWeight = normalized.reduce((sum, allocation) => {
        const currentWeight = units.get(allocation.id)! * latestValues.get(allocation.id)! / totalValue;
        return sum + Math.abs(currentWeight - allocation.targetWeight);
      }, 0);
      const cost = totalValue * tradedWeight * input.transactionCostBps / 10_000;
      totalValue -= cost;
      turnover += tradedWeight;
      for (const allocation of normalized) units.set(allocation.id, totalValue * allocation.targetWeight / latestValues.get(allocation.id)!);
      cash = totalValue * (1 - totalWeight);
    }
    peak = Math.max(peak, totalValue);
    points.push({ date, value: totalValue, drawdown: totalValue / peak - 1 });
    previousDate = date;
    previousPeriod = currentPeriod;
  }
  const metrics = calculateSeriesMetrics(points);
  const finalValue = points.at(-1)?.value ?? 1;
  const contributions = normalized.map((allocation) => ({
    id: allocation.id,
    name: allocation.name,
    endingWeight: units.get(allocation.id)! * latestValues.get(allocation.id)! / finalValue,
  }));
  return { actualStartDate, points, metrics, turnover, contributions, assumptions: { riskFreeRate: 0, cashAnnualReturn: input.cashAnnualReturn, transactionCostBps: input.transactionCostBps } };
}

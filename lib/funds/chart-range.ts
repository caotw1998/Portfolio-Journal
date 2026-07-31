import type { ChartDateRange } from "@/lib/chart-time-range";
import { buildDividendAdjustedSeries } from "@/lib/funds/metrics";

export type FundNavChartPoint = {
  date: string;
  unitNav: number;
  accumulatedNav: number | null;
  dailyReturn?: number | null;
  dividendAmount: number | null;
};

export function filterFundNavPoints(
  points: FundNavChartPoint[],
  range: ChartDateRange | null,
) {
  if (!range) {
    return points;
  }

  return points.filter(
    (point) => point.date >= range.from && point.date <= range.to,
  );
}

export type FundReturnPoint = FundNavChartPoint & {
  value: number;
  returnRate: number;
};

export type ComparisonSeriesInput = {
  id: string;
  kind: "fund" | "benchmark";
  name: string;
  code: string;
  basis: "dividend_reinvested" | "accumulated_nav" | "unit_nav" | "close";
  points: Array<{
    date: string;
    value: number;
    normalizedValue: number;
  }>;
};

export type ComparisonReturnSeries = Omit<ComparisonSeriesInput, "points"> & {
  points: Array<{
    date: string;
    value: number;
    returnRate: number;
  }>;
};

export type SelectedRangeSeriesMetric = {
  id: string;
  kind: "fund" | "benchmark";
  name: string;
  fromDate: string;
  toDate: string;
  returnRate: number;
  annualizedReturn: number | null;
  maxDrawdown: number;
};

export type SelectedRangeMetrics = {
  from: string;
  to: string;
  days: number;
  series: SelectedRangeSeriesMetric[];
  excessReturn: number | null;
};

export function snapChartDate(dates: string[], fractionalIndex: number) {
  if (!dates.length || !Number.isFinite(fractionalIndex)) return null;
  const index = Math.min(
    dates.length - 1,
    Math.max(0, Math.round(fractionalIndex)),
  );
  return dates[index] ?? null;
}

export function calculateSelectedRangeMetrics(
  series: ComparisonReturnSeries[],
  firstDate: string,
  secondDate: string,
): SelectedRangeMetrics | null {
  if (!firstDate || !secondDate || firstDate === secondDate) return null;
  const [from, to] = firstDate < secondDate
    ? [firstDate, secondDate]
    : [secondDate, firstDate];
  const elapsedDays = daysBetween(from, to);
  if (elapsedDays <= 0) return null;

  const metrics = series.flatMap((item): SelectedRangeSeriesMetric[] => {
    const selectedPoints = item.points
      .filter((point) => point.date >= from && point.date <= to && point.value > 0 && Number.isFinite(point.value))
      .sort((left, right) => left.date.localeCompare(right.date));
    if (selectedPoints.length < 2) return [];
    const first = selectedPoints[0]!;
    const last = selectedPoints.at(-1)!;
    const returnRate = last.value / first.value - 1;
    const drawdown = calculateDrawdownRecovery(selectedPoints);
    return [{
      id: item.id,
      kind: item.kind,
      name: item.name,
      fromDate: first.date,
      toDate: last.date,
      returnRate,
      annualizedReturn: calculateAnnualizedReturn(selectedPoints),
      maxDrawdown: drawdown?.maxDrawdown ?? 0,
    }];
  });
  const fundMetric = metrics.find((item) => item.kind === "fund");
  const benchmarkMetric = metrics.find((item) => item.kind === "benchmark");

  return {
    from,
    to,
    days: elapsedDays,
    series: metrics,
    excessReturn: fundMetric && benchmarkMetric
      ? fundMetric.returnRate - benchmarkMetric.returnRate
      : null,
  };
}

export type FundManagerTenureInput = {
  managerName: string;
  startDate: string | null;
  endDate: string | null;
};

export function resolveCurrentManagerStartDate(
  managerTenures: FundManagerTenureInput[],
) {
  const currentStartDates = managerTenures
    .filter((tenure): tenure is FundManagerTenureInput & { startDate: string } => (
      tenure.endDate === null && Boolean(tenure.startDate)
    ))
    .map((tenure) => tenure.startDate)
    .sort();

  return currentStartDates[0] ?? null;
}

export type ManagerChangeMarker = {
  valuationDate: string;
  changes: Array<{
    date: string;
    managerNames: string[];
  }>;
};

export type DrawdownRecovery = {
  maxDrawdown: number;
  peakDate: string | null;
  troughDate: string | null;
  recoveryDate: string | null;
  declineDays: number | null;
  recoveryDays: number | null;
};

export type DrawdownPoint = {
  date: string;
  value: number;
  drawdown: number;
};

export function buildFundReturnSeries(points: FundNavChartPoint[]) {
  const orderedPoints = points
    .filter((point) => Number.isFinite(point.unitNav) && point.unitNav > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  const adjustedByDate = new Map(buildDividendAdjustedSeries(orderedPoints).map((point) => [point.date, point.value]));

  return {
    basis: "dividend_reinvested",
    points: orderedPoints.map((point): FundReturnPoint => {
      const value = adjustedByDate.get(point.date) ?? 1;
      return {
        ...point,
        value,
        returnRate: value - 1,
      };
    }),
  } as const;
}

export function buildComparisonReturnSeries(
  series: ComparisonSeriesInput[],
): ComparisonReturnSeries[] {
  return series.map((item) => ({
    ...item,
    points: item.points.map((point) => ({
      date: point.date,
      value: point.value,
      returnRate: point.normalizedValue - 1,
    })),
  }));
}

export function calculateAnnualizedReturn(
  points: Array<{ date: string; value: number }>,
) {
  const validPoints = points
    .filter((point) => point.value > 0 && Number.isFinite(point.value) && !Number.isNaN(Date.parse(`${point.date}T00:00:00Z`)))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (validPoints.length < 2) return null;

  const first = validPoints[0]!;
  const last = validPoints.at(-1)!;
  const elapsedDays = (
    Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)
  ) / 86_400_000;
  if (elapsedDays <= 0) return null;

  const annualizedReturn = Math.pow(last.value / first.value, 365.25 / elapsedDays) - 1;
  return Number.isFinite(annualizedReturn) ? annualizedReturn : null;
}

export function buildManagerChangeMarkers(
  managerTenures: FundManagerTenureInput[],
  navPoints: Array<{ date: string }>,
): ManagerChangeMarker[] {
  const starts = managerTenures
    .filter((tenure): tenure is FundManagerTenureInput & { startDate: string } => Boolean(tenure.startDate))
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
  const initialStartDate = starts[0]?.startDate;
  const orderedNavDates = Array.from(new Set(navPoints.map((point) => point.date))).sort();
  const firstNavDate = orderedNavDates[0];
  const lastNavDate = orderedNavDates.at(-1);
  if (!initialStartDate || !firstNavDate || !lastNavDate) return [];

  const namesByStartDate = new Map<string, Set<string>>();
  for (const tenure of starts) {
    if (tenure.startDate === initialStartDate) continue;
    const names = namesByStartDate.get(tenure.startDate) ?? new Set<string>();
    names.add(tenure.managerName);
    namesByStartDate.set(tenure.startDate, names);
  }

  const changesByValuationDate = new Map<string, ManagerChangeMarker["changes"]>();
  for (const [startDate, managerNames] of namesByStartDate) {
    if (startDate < firstNavDate || startDate > lastNavDate) continue;
    const valuationDate = orderedNavDates.find((date) => date >= startDate);
    if (!valuationDate) continue;
    const changes = changesByValuationDate.get(valuationDate) ?? [];
    changes.push({
      date: startDate,
      managerNames: Array.from(managerNames).sort((left, right) => left.localeCompare(right, "zh-CN")),
    });
    changesByValuationDate.set(valuationDate, changes);
  }

  return Array.from(changesByValuationDate, ([valuationDate, changes]) => ({
    valuationDate,
    changes: changes.sort((left, right) => left.date.localeCompare(right.date)),
  })).sort((left, right) => left.valuationDate.localeCompare(right.valuationDate));
}

function daysBetween(from: string, to: string) {
  return Math.round((
    Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  ) / 86_400_000);
}

export function calculateDrawdownRecovery(
  points: Array<{ date: string; value: number }>,
): DrawdownRecovery | null {
  const validPoints = points
    .filter((point) => point.value > 0 && Number.isFinite(point.value) && !Number.isNaN(Date.parse(`${point.date}T00:00:00Z`)))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (validPoints.length < 2) return null;

  let peakIndex = 0;
  let deepestPeakIndex: number | null = null;
  let deepestTroughIndex: number | null = null;
  let maxDrawdown = 0;

  for (let index = 1; index < validPoints.length; index += 1) {
    const point = validPoints[index]!;
    const peak = validPoints[peakIndex]!;
    if (point.value > peak.value) {
      peakIndex = index;
      continue;
    }
    const drawdown = point.value / peak.value - 1;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      deepestPeakIndex = peakIndex;
      deepestTroughIndex = index;
    }
  }

  if (deepestPeakIndex === null || deepestTroughIndex === null) {
    return {
      maxDrawdown: 0,
      peakDate: null,
      troughDate: null,
      recoveryDate: null,
      declineDays: null,
      recoveryDays: null,
    };
  }

  const deepestPeak = validPoints[deepestPeakIndex]!;
  const deepestTrough = validPoints[deepestTroughIndex]!;
  const recovery = validPoints.slice(deepestTroughIndex + 1)
    .find((point) => point.value >= deepestPeak.value);

  return {
    maxDrawdown: Number(maxDrawdown.toFixed(8)),
    peakDate: deepestPeak.date,
    troughDate: deepestTrough.date,
    recoveryDate: recovery?.date ?? null,
    declineDays: daysBetween(deepestPeak.date, deepestTrough.date),
    recoveryDays: recovery ? daysBetween(deepestTrough.date, recovery.date) : null,
  };
}

export function buildDrawdownSeries(
  points: Array<{ date: string; value: number }>,
): DrawdownPoint[] {
  const validPoints = points
    .filter((point) => point.value > 0 && Number.isFinite(point.value) && !Number.isNaN(Date.parse(`${point.date}T00:00:00Z`)))
    .sort((left, right) => left.date.localeCompare(right.date));
  let runningPeak = 0;

  return validPoints.map((point) => {
    runningPeak = Math.max(runningPeak, point.value);
    return {
      ...point,
      drawdown: Number((point.value / runningPeak - 1).toFixed(8)),
    };
  });
}

import type { ChartDateRange, MarketCycleOption } from "@/lib/chart-time-range";
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
  kind: "fund" | "benchmark" | "stock";
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
  kind: "fund" | "benchmark" | "stock";
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
  const primaryMetric = metrics.find((item) => item.id === series[0]?.id);
  const baselineMetric = metrics.find((item) => item.id === series[1]?.id);

  return {
    from,
    to,
    days: elapsedDays,
    series: metrics,
    excessReturn: primaryMetric && baselineMetric
      ? primaryMetric.returnRate - baselineMetric.returnRate
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

export function restrictComparisonSeriesToRange(
  series: ComparisonReturnSeries[],
  requestedRange: ChartDateRange | null,
) {
  if (!series.length) return { series: [], range: null, clamped: false };
  const starts = series.map((item) => item.points[0]?.date).filter((date): date is string => Boolean(date));
  const ends = series.map((item) => item.points.at(-1)?.date).filter((date): date is string => Boolean(date));
  if (starts.length !== series.length || ends.length !== series.length) return { series: [], range: null, clamped: false };
  const from = [requestedRange?.from, ...starts].filter((date): date is string => Boolean(date)).sort().at(-1)!;
  const to = [requestedRange?.to, ...ends].filter((date): date is string => Boolean(date)).sort()[0]!;
  if (from >= to) return { series: [], range: null, clamped: true };
  const restricted = series.flatMap((item): ComparisonReturnSeries[] => {
    const points = item.points.filter((point) => point.date >= from && point.date <= to);
    if (points.length < 2 || !points[0]?.value) return [];
    const baseValue = points[0].value;
    return [{ ...item, points: points.map((point) => ({ ...point, returnRate: point.value / baseValue - 1 })) }];
  });
  return {
    series: restricted.length === series.length ? restricted : [],
    range: restricted.length === series.length ? { from, to } : null,
    clamped: Boolean(requestedRange && (from !== requestedRange.from || to !== requestedRange.to)),
  };
}

export type MarketCyclePerformance = MarketCycleOption & {
  primaryReturn: number;
  baselineReturn: number | null;
  excessReturn: number | null;
  primaryAnnualizedReturn: number | null;
  baselineAnnualizedReturn: number | null;
  annualizedExcessReturn: number | null;
};

export type MarketCycleSegment = {
  cycle: MarketCyclePerformance;
  series: ComparisonReturnSeries[];
};

export type MarketCycleLabelPresentation = {
  mode: "full" | "compact" | "vertical";
  fontSize: number;
  lineHeight: number;
  lane: 0 | 1 | 2;
  lines: string[];
  ariaLabel: string;
};

function formatCycleReturn(value: number | null) {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function roundLabelSize(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildMarketCycleLabelPresentation(
  cycle: MarketCyclePerformance,
  pixelWidth: number,
  hasBaseline: boolean,
  cycleIndex: number,
): MarketCycleLabelPresentation {
  const safeWidth = Math.max(0, Number.isFinite(pixelWidth) ? pixelWidth : 0);
  const cycleKind = cycle.kind === "bull" ? "牛市" : cycle.kind === "bear" ? "熊市" : "行情";
  const primary = formatCycleReturn(cycle.primaryAnnualizedReturn);
  const baseline = formatCycleReturn(cycle.baselineAnnualizedReturn);
  const excess = formatCycleReturn(cycle.annualizedExcessReturn);
  const completeLines = [
    cycleKind,
    `主标年化 ${primary}`,
    ...(hasBaseline ? [`基准年化 ${baseline}`, `年化超额 ${excess}`] : []),
  ];
  const ariaLabel = `${cycle.label}，${cycle.from} 至 ${cycle.to ?? "最新"}，${completeLines.slice(1).join("，")}`;

  if (safeWidth >= 96) {
    const fontSize = roundLabelSize(Math.min(11, 9 + (safeWidth - 96) / 44));
    return { mode: "full", fontSize, lineHeight: fontSize + 3, lane: 0, lines: completeLines, ariaLabel };
  }
  if (safeWidth >= 56) {
    const fontSize = roundLabelSize(7 + (safeWidth - 56) * 2 / 39);
    return {
      mode: "compact",
      fontSize,
      lineHeight: fontSize + 2.5,
      lane: cycleIndex % 3 as 0 | 1 | 2,
      lines: [cycleKind.slice(0, 1), `主 ${primary}`, ...(hasBaseline ? [`基 ${baseline}`, `超 ${excess}`] : [])],
      ariaLabel,
    };
  }

  const fontSize = roundLabelSize(Math.min(7, 6 + safeWidth / 56));
  return {
    mode: "vertical",
    fontSize,
    lineHeight: fontSize + 2,
    lane: cycleIndex % 3 as 0 | 1 | 2,
    lines: [`${cycleKind.slice(0, 1)} 主${primary}${hasBaseline ? ` 基${baseline} 超${excess}` : ""}`],
    ariaLabel,
  };
}

export function calculateMarketCyclePerformance(
  series: ComparisonReturnSeries[],
  cycles: MarketCycleOption[],
): MarketCyclePerformance[] {
  return buildMarketCycleSegments(series, cycles).map((segment) => segment.cycle);
}

export function buildMarketCycleSegments(
  series: ComparisonReturnSeries[],
  cycles: MarketCycleOption[],
): MarketCycleSegment[] {
  return cycles.flatMap((cycle): MarketCycleSegment[] => {
    const availableTo = series[0]?.points.at(-1)?.date;
    if (!availableTo) return [];
    const isSharedBoundary = cycle.to !== null && cycles.some((other) => other.id !== cycle.id && other.from === cycle.to);
    const requestedTo = cycle.to ?? availableTo;
    const primaryDates = series[0]?.points
      .filter((point) => point.date >= cycle.from && point.date <= requestedTo && (!isSharedBoundary || point.date < requestedTo))
      .map((point) => point.date) ?? [];
    const effectiveTo = primaryDates.at(-1);
    if (!effectiveTo) return [];
    const metrics = calculateSelectedRangeMetrics(series, cycle.from, effectiveTo);
    const primary = metrics?.series.find((item) => item.id === series[0]?.id);
    if (!metrics || !primary) return [];
    const baseline = metrics.series.find((item) => item.id === series[1]?.id);
    const performance: MarketCyclePerformance = {
      ...cycle,
      from: primary.fromDate,
      to: primary.toDate,
      primaryReturn: primary.returnRate,
      baselineReturn: baseline?.returnRate ?? null,
      excessReturn: baseline ? primary.returnRate - baseline.returnRate : null,
      primaryAnnualizedReturn: primary.annualizedReturn,
      baselineAnnualizedReturn: baseline?.annualizedReturn ?? null,
      annualizedExcessReturn: primary.annualizedReturn !== null && baseline?.annualizedReturn !== null && baseline?.annualizedReturn !== undefined
        ? primary.annualizedReturn - baseline.annualizedReturn
        : null,
    };
    const segmentSeries = series.flatMap((item): ComparisonReturnSeries[] => {
      const points = item.points.filter((point) => point.date >= performance.from && point.date <= (performance.to ?? performance.from));
      const base = points[0]?.value;
      if (!base || points.length < 2) return [];
      return [{ ...item, points: points.map((point) => ({ ...point, returnRate: point.value / base - 1 })) }];
    });
    if (segmentSeries.length !== series.length) return [];
    return [{ cycle: performance, series: segmentSeries }];
  });
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

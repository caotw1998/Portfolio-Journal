export type ResearchPoint = { date: string; value: number };

export type ResearchMetrics = {
  rangeReturn: number | null;
  annualizedReturn: number | null;
  maxDrawdown: number | null;
  volatility: number | null;
  sharpeRatio: number | null;
};

export type ResearchSeriesInput = {
  id: string;
  kind: "fund" | "benchmark";
  name: string;
  code: string;
  basis: "dividend_reinvested" | "accumulated_nav" | "unit_nav" | "close";
  points: ResearchPoint[];
};

export type ResearchSeries = Omit<ResearchSeriesInput, "points"> & {
  points: Array<{ date: string; value: number; normalizedValue: number }>;
  metrics: ResearchMetrics;
};

function round(value: number) {
  return Number(value.toFixed(8));
}

function sampleDeviation(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function computeResearchMetrics(points: ResearchPoint[]): ResearchMetrics {
  const valid = points.filter((point) => point.value > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (valid.length < 2) {
    return { rangeReturn: null, annualizedReturn: null, maxDrawdown: null, volatility: null, sharpeRatio: null };
  }
  const first = valid[0]!;
  const last = valid.at(-1)!;
  const rangeReturn = last.value / first.value - 1;
  const elapsedDays = (Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) / 86_400_000;
  const annualizedReturn = elapsedDays > 0
    ? Math.pow(last.value / first.value, 365.25 / elapsedDays) - 1
    : null;
  const dailyReturns = valid.slice(1).map((point, index) => point.value / valid[index]!.value - 1);
  const deviation = sampleDeviation(dailyReturns);
  let peak = valid[0]!.value;
  let maxDrawdown = 0;
  for (const point of valid) {
    peak = Math.max(peak, point.value);
    maxDrawdown = Math.min(maxDrawdown, point.value / peak - 1);
  }
  const volatility = deviation === null ? null : deviation * Math.sqrt(252);
  const averageReturn = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const sharpeRatio = deviation && deviation > 0 ? averageReturn / deviation * Math.sqrt(252) : null;
  return {
    rangeReturn: round(rangeReturn),
    annualizedReturn: annualizedReturn === null ? null : round(annualizedReturn),
    maxDrawdown: round(maxDrawdown),
    volatility: volatility === null ? null : round(volatility),
    sharpeRatio: sharpeRatio === null ? null : round(sharpeRatio),
  };
}

export function buildResearchComparison(inputs: ResearchSeriesInput[]) {
  const populated = inputs
    .map((series) => ({ ...series, points: series.points.filter((point) => point.value > 0).sort((a, b) => a.date.localeCompare(b.date)) }))
    .filter((series) => series.points.length > 0);
  if (populated.length !== inputs.length || populated.length === 0) {
    return { range: null, series: [] as ResearchSeries[], warnings: ["部分序列没有可用于对比的数据。"] };
  }
  const from = populated.map((series) => series.points[0]!.date).sort().at(-1)!;
  const to = populated.map((series) => series.points.at(-1)!.date).sort()[0]!;
  if (from > to) {
    return { range: null, series: [] as ResearchSeries[], warnings: ["所选基金与指数没有共同数据区间。"] };
  }
  const rangeSeries = populated.map((series) => ({
    ...series,
    points: series.points.filter((point) => point.date <= to),
  }));
  const dates = Array.from(new Set([from, ...rangeSeries.flatMap((series) => series.points.filter((point) => point.date >= from).map((point) => point.date))])).sort();
  const series = rangeSeries.map((item): ResearchSeries => {
    const seedIndex = item.points.findLastIndex((point) => point.date <= from);
    const seed = item.points[Math.max(seedIndex, 0)]!;
    const base = seed.value;
    let cursor = Math.max(seedIndex, 0);
    let latest = seed;
    const chartPoints = dates.flatMap((date) => {
      while (item.points[cursor + 1] && item.points[cursor + 1]!.date <= date) {
        cursor += 1;
        latest = item.points[cursor]!;
      }
      if (latest.date > date) return [];
      return [{ date, value: latest.value, normalizedValue: round(latest.value / base) }];
    });
    const metricPoints = item.points.filter((point) => point.date >= from);
    return { id: item.id, kind: item.kind, name: item.name, code: item.code, basis: item.basis, points: chartPoints, metrics: computeResearchMetrics(metricPoints) };
  });
  return { range: { from, to }, series, warnings: [] as string[] };
}

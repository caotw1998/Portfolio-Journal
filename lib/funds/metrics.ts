export type ValuePoint = { date: string; value: number };
export type FundPerformancePoint = {
  date: string;
  unitNav: number;
  dailyReturn?: number | null;
  dividendAmount?: number | null;
};

export function buildDividendAdjustedSeries(input: FundPerformancePoint[]): ValuePoint[] {
  const points = input
    .filter((point) => Number.isFinite(point.unitNav) && point.unitNav > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (!points.length) return [];

  let value = 1;
  return points.map((point, index) => {
    if (index > 0) {
      const previous = points[index - 1]!;
      const dailyReturn = point.dailyReturn;
      if (typeof dailyReturn === "number" && Number.isFinite(dailyReturn) && dailyReturn > -1) {
        value *= 1 + dailyReturn;
      } else {
        const dividendAmount = Number.isFinite(point.dividendAmount) && (point.dividendAmount ?? 0) > 0
          ? point.dividendAmount!
          : 0;
        value *= (point.unitNav + dividendAmount) / previous.unitNav;
      }
    }
    return { date: point.date, value };
  });
}

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function yearsBetween(first: string, last: string) {
  return (new Date(`${last}T00:00:00Z`).getTime() - new Date(`${first}T00:00:00Z`).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function returnSince(points: ValuePoint[], years: number) {
  const last = points.at(-1);
  if (!last) return null;
  const cutoff = new Date(`${last.date}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const start = points.find((point) => point.date >= cutoff.toISOString().slice(0, 10));
  if (!start || start === last || start.value <= 0) return null;
  return last.value / start.value - 1;
}

export function calculateSeriesMetrics(input: ValuePoint[]) {
  const points = input.filter((point) => Number.isFinite(point.value) && point.value > 0).sort((left, right) => left.date.localeCompare(right.date));
  if (points.length < 2) {
    return { totalReturn: null, annualizedReturn: null, oneYearReturn: null, threeYearReturn: null, fiveYearReturn: null, maxDrawdown: null, volatility: null, sharpe: null, sortino: null, calmar: null };
  }
  const first = points[0]!;
  const last = points.at(-1)!;
  const totalReturn = last.value / first.value - 1;
  const years = yearsBetween(first.date, last.date);
  const annualizedReturn = years > 0 ? Math.pow(last.value / first.value, 1 / years) - 1 : null;
  const dailyReturns = points.slice(1).map((point, index) => point.value / points[index]!.value - 1);
  const average = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / Math.max(dailyReturns.length - 1, 1);
  const volatility = Math.sqrt(variance) * Math.sqrt(252);
  const downside = dailyReturns.filter((value) => value < 0);
  const downsideDeviation = downside.length
    ? Math.sqrt(downside.reduce((sum, value) => sum + value * value, 0) / downside.length) * Math.sqrt(252)
    : 0;
  let peak = points[0]!.value;
  let maxDrawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.value);
    maxDrawdown = Math.min(maxDrawdown, point.value / peak - 1);
  }
  return {
    totalReturn,
    annualizedReturn,
    oneYearReturn: returnSince(points, 1),
    threeYearReturn: returnSince(points, 3),
    fiveYearReturn: returnSince(points, 5),
    maxDrawdown,
    volatility,
    sharpe: annualizedReturn === null ? null : safeRatio(annualizedReturn, volatility),
    sortino: annualizedReturn === null ? null : safeRatio(annualizedReturn, downsideDeviation),
    calmar: annualizedReturn === null ? null : safeRatio(annualizedReturn, Math.abs(maxDrawdown)),
  };
}

import { ApiError } from "@/lib/api/responses";

export type BenchmarkValuationMetric = "pe" | "pb" | "dividendYield";
export type BenchmarkValuationRange = "3y" | "5y" | "10y" | "all";
export type BenchmarkValuationBand = "极低估" | "较低估" | "适中" | "较高估" | "极高估";
export type BenchmarkValuationPoint = {
  date: string;
  peTtm?: number | null;
  pb?: number | null;
  dividendYield?: number | null;
};

const CSINDEX_PE_URL = "https://www.csindex.com.cn/csindex-home/perf/indexCsiDsPe";
const CSINDEX_CURRENT_URL = "https://www.csindex.com.cn/csindex-home/data-service/indexValuation";

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function compactDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return null;
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ? null : date;
}

function validCsindexRoot(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (root.code !== "200" || root.success !== true) throw new ApiError("中证估值接口返回了无效数据。", 502);
  return root;
}

export function parseCsindexPePayload(payload: unknown): BenchmarkValuationPoint[] {
  const root = validCsindexRoot(payload);
  const rows = Array.isArray(root.data) ? root.data : [];
  return rows.flatMap((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const date = compactDate(item.tradeDate);
    const peTtm = finiteNumber(item.peg);
    return date && peTtm !== null && peTtm > 0 ? [{ date, peTtm }] : [];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeIndexName(value: string) {
  return value.trim().toUpperCase().replace(/[\s·—_()-]/g, "").replace(/全收益指数|净收益指数|全收益|净收益|收益指数|指数/g, "");
}

export function parseCsindexCurrentValuationPayload(payload: unknown, instrumentName: string): BenchmarkValuationPoint[] {
  const root = validCsindexRoot(payload);
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const date = compactDate(data.tradeDate);
  const rows = Array.isArray(data.indexValuations) ? data.indexValuations : [];
  const normalizedInstrumentName = normalizeIndexName(instrumentName);
  const match = rows.find((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return typeof item.indexName === "string" && normalizeIndexName(item.indexName) === normalizedInstrumentName;
  });
  if (!date || !match || typeof match !== "object") return [];
  const item = match as Record<string, unknown>;
  const peTtm = finiteNumber(item.peg);
  const pb = finiteNumber(item.pb);
  const dividendYield = finiteNumber(item.dp);
  if (peTtm === null && pb === null && dividendYield === null) return [];
  return [{ date, peTtm, pb, dividendYield }];
}

function metricValue(point: BenchmarkValuationPoint, metric: BenchmarkValuationMetric) {
  return metric === "pe" ? point.peTtm : metric === "pb" ? point.pb : point.dividendYield;
}

export function formatValuationAxisTick(value: number, metric: BenchmarkValuationMetric) {
  if (!Number.isFinite(value)) return "--";
  const rounded = Number(value.toFixed(2));
  return `${rounded}${metric === "dividendYield" ? "%" : ""}`;
}

function quantile(sorted: number[], percentile: number) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function valuationBand(percentile: number): BenchmarkValuationBand {
  if (percentile < 20) return "极低估";
  if (percentile < 40) return "较低估";
  if (percentile < 60) return "适中";
  if (percentile < 80) return "较高估";
  return "极高估";
}

export function calculateValuationSummary(points: BenchmarkValuationPoint[], metric: BenchmarkValuationMetric, range: BenchmarkValuationRange) {
  const available = points
    .map((point) => ({ date: point.date, value: metricValue(point, metric) }))
    .filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value) && point.value >= 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  const latest = available.at(-1);
  if (!latest) return { points: [], current: null, currentDate: null, average: null, percentile: null, valuationPercentile: null, band: null, observationCount: 0, thresholds: [] as number[] };
  let filtered = available;
  if (range !== "all") {
    const cutoff = new Date(`${latest.date}T00:00:00Z`);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - Number.parseInt(range, 10));
    const cutoffText = cutoff.toISOString().slice(0, 10);
    filtered = available.filter((point) => point.date >= cutoffText);
  }
  const values = filtered.map((point) => point.value).sort((left, right) => left - right);
  const observationCount = values.length;
  const average = observationCount ? values.reduce((sum, value) => sum + value, 0) / observationCount : null;
  if (observationCount < 20) return { points: filtered, current: latest.value, currentDate: latest.date, average, percentile: null, valuationPercentile: null, band: null, observationCount, thresholds: [] as number[] };
  const percentile = values.filter((value) => value <= latest.value).length / observationCount * 100;
  const valuationPercentile = metric === "dividendYield" ? 100 - percentile : percentile;
  return {
    points: filtered,
    current: latest.value,
    currentDate: latest.date,
    average,
    percentile,
    valuationPercentile,
    band: valuationBand(valuationPercentile),
    observationCount,
    thresholds: [0.2, 0.4, 0.6, 0.8].map((value) => quantile(values, value)!),
  };
}

async function requestJson(url: URL, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new ApiError(`中证估值同步失败（${response.status}）。`, 502);
  try {
    return await response.json() as unknown;
  } catch {
    throw new ApiError("中证估值接口返回了无效数据。", 502);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "中证估值同步失败。";
}

export async function fetchCsindexBenchmarkValuations(
  instrument: { code: string; name: string; market: string },
  fetchImpl: typeof fetch,
) {
  const market = instrument.market.toUpperCase();
  const supported = ["CN", "SH"].includes(market) && !instrument.code.startsWith("399");
  if (!supported) return { supported: false, points: [] as BenchmarkValuationPoint[], error: null as string | null };

  const peUrl = new URL(CSINDEX_PE_URL);
  peUrl.searchParams.set("indexCode", instrument.code);
  const [peResult, currentResult] = await Promise.allSettled([
    requestJson(peUrl, fetchImpl).then(parseCsindexPePayload),
    requestJson(new URL(CSINDEX_CURRENT_URL), fetchImpl).then((payload) => parseCsindexCurrentValuationPayload(payload, instrument.name)),
  ]);
  const merged = new Map<string, BenchmarkValuationPoint>();
  for (const point of peResult.status === "fulfilled" ? peResult.value : []) merged.set(point.date, point);
  for (const point of currentResult.status === "fulfilled" ? currentResult.value : []) merged.set(point.date, { ...merged.get(point.date), ...point });
  const errors = [
    peResult.status === "rejected" ? `PE 历史：${errorMessage(peResult.reason)}` : null,
    currentResult.status === "rejected" ? `当前估值：${errorMessage(currentResult.reason)}` : null,
  ].filter((value): value is string => value !== null);
  return { supported: true, points: Array.from(merged.values()).sort((left, right) => left.date.localeCompare(right.date)), error: errors.length ? errors.join("；") : null };
}

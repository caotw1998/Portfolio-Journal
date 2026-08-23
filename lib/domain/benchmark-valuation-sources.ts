import * as XLSX from "xlsx";
import { ApiError } from "@/lib/api/responses";
import {
  fetchCsindexBenchmarkValuations,
  type BenchmarkValuationPoint,
} from "@/lib/domain/benchmark-valuations";

export const CSI_DIVIDEND_TOTAL_RETURN_CODE = "H00922";
export const CSI_DIVIDEND_HISTORY_CUTOFF = "2026-08-21";
export const CSI_DIVIDEND_INDICATOR_URL = "https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/indicator/000922indicator.xls";
export const CHINABOND_HISTORY_PAGE_URL = "https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/more?locale=cn_ZH";
const CHINABOND_HISTORY_QUERY_URL = "https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery";
const LOOKBACK_DAYS = 35;

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function compactDate(value: unknown) {
  const compact = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{8}$/.test(compact)) return null;
  const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  return Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ? null : date;
}

export function parseCsiDividendIndicatorWorkbook(input: ArrayBuffer | Uint8Array): BenchmarkValuationPoint[] {
  const workbook = XLSX.read(input, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ApiError("中证红利指标文件没有工作表。", 502);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1, raw: true });
  const header = rows[0] ?? [];
  const dateIndex = header.findIndex((value) => String(value).includes("日期Date"));
  const codeIndex = header.findIndex((value) => String(value).includes("指数代码Index Code"));
  const dividendIndex = header.findIndex((value) => String(value).includes("D/P2"));
  if (dateIndex < 0 || codeIndex < 0 || dividendIndex < 0) throw new ApiError("中证红利指标文件缺少日期、代码或 D/P2 列。", 502);
  return rows.slice(1).flatMap((row) => {
    const date = compactDate(row[dateIndex]);
    const code = String(row[codeIndex] ?? "").trim().padStart(6, "0");
    const dividendYield = finiteNumber(row[dividendIndex]);
    if (!date || code !== "000922" || dividendYield === null || dividendYield < 0) return [];
    return [{
      date,
      dividendYield,
      dividendYieldSource: "csindex_dp2",
      dividendYieldSourceUrl: CSI_DIVIDEND_INDICATOR_URL,
    }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function decodeHtmlCell(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .trim();
}

export function parseChinabondTenYearHistoryHtml(html: string): BenchmarkValuationPoint[] {
  const points: BenchmarkValuationPoint[] = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(rowMatch[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), (match) => decodeHtmlCell(match[1]!));
    const date = cells[1];
    const riskFreeRate = finiteNumber(cells[8]);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || riskFreeRate === null || riskFreeRate <= 0) continue;
    points.push({
      date,
      riskFreeRate,
      riskFreeRateSource: "chinabond_10y_government",
      riskFreeRateSourceUrl: CHINABOND_HISTORY_PAGE_URL,
    });
  }
  return points.sort((left, right) => left.date.localeCompare(right.date));
}

function beijingDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateDaysBefore(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

async function requestBinary(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { Accept: "application/vnd.ms-excel,*/*", "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new ApiError(`中证红利 D/P2 同步失败（${response.status}）。`, 502);
  return new Uint8Array(await response.arrayBuffer());
}

async function requestChinabondHistory(asOfDate: Date, fetchImpl: typeof fetch) {
  const endDate = beijingDate(asOfDate);
  const url = new URL(CHINABOND_HISTORY_QUERY_URL);
  url.searchParams.set("startDate", dateDaysBefore(endDate, LOOKBACK_DAYS));
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("gjqx", "10");
  url.searchParams.set("qxId", "hzsylqx");
  url.searchParams.set("locale", "cn_ZH");
  const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new ApiError(`中债无风险利率同步失败（${response.status}）。`, 502);
  const points = parseChinabondTenYearHistoryHtml(await response.text());
  if (!points.length) throw new ApiError("中债无风险利率接口没有返回有效的 10 年期数据。", 502);
  return points;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "估值数据源同步失败。";
}

function mergePoints(pointGroups: BenchmarkValuationPoint[][]) {
  const merged = new Map<string, BenchmarkValuationPoint>();
  for (const points of pointGroups) {
    for (const point of points) merged.set(point.date, { ...merged.get(point.date), ...point });
  }
  return Array.from(merged.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export async function fetchOfficialBenchmarkValuations(
  instrument: { code: string; name: string; market: string },
  fetchImpl: typeof fetch,
  asOfDate: Date = new Date(),
) {
  const base = await fetchCsindexBenchmarkValuations(instrument, fetchImpl);
  if (!base.supported || instrument.code.toUpperCase() !== CSI_DIVIDEND_TOTAL_RETURN_CODE) return base;

  const protectedBasePoints = base.points.map((point) => ({ ...point, dividendYield: undefined }));
  const [dividendResult, riskFreeResult] = await Promise.allSettled([
    requestBinary(CSI_DIVIDEND_INDICATOR_URL, fetchImpl).then(parseCsiDividendIndicatorWorkbook),
    requestChinabondHistory(asOfDate, fetchImpl),
  ]);
  const errors = [
    base.error,
    dividendResult.status === "rejected" ? readableError(dividendResult.reason) : null,
    riskFreeResult.status === "rejected" ? readableError(riskFreeResult.reason) : null,
  ].filter((value): value is string => Boolean(value));
  return {
    supported: true,
    points: mergePoints([
      protectedBasePoints,
      dividendResult.status === "fulfilled" ? dividendResult.value : [],
      riskFreeResult.status === "fulfilled" ? riskFreeResult.value : [],
    ]),
    error: errors.length ? errors.join("；") : null,
  };
}

import { ApiError } from "@/lib/api/responses";

type DailyClose = { date: string; close: number };

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError("参考行情日期格式无效。", 400);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new ApiError("参考行情日期无效。", 400);
  return date;
}

function eastmoneySecurityId(code: string) {
  if (!/^\d{6}$/.test(code)) throw new ApiError("仅支持六位 A 股代码的参考行情。", 400);
  return `${/^[569]/.test(code) ? "1" : "0"}.${code}`;
}

function parseEastmoneyDailyClose(payload: unknown, onOrBeforeDate: string): DailyClose | null {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const klines = Array.isArray(data.klines) ? data.klines : [];
  const points = klines.flatMap((item): DailyClose[] => {
    if (typeof item !== "string") return [];
    const [date, , closeText] = item.split(",");
    const close = Number(closeText);
    if (!date || date > onOrBeforeDate || !Number.isFinite(close) || close <= 0) return [];
    return [{ date, close }];
  });
  return points.sort((left, right) => left.date.localeCompare(right.date)).at(-1) ?? null;
}

function parseSinaDailyClose(payload: string, onOrBeforeDate: string): DailyClose | null {
  const start = payload.indexOf("([");
  const end = payload.lastIndexOf("])");
  if (start < 0 || end <= start) return null;
  let rows: unknown;
  try {
    rows = JSON.parse(payload.slice(start + 1, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;
  const points = rows.flatMap((item): DailyClose[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const date = typeof row.day === "string" ? row.day : "";
    const close = Number(row.close);
    if (!date || date > onOrBeforeDate || !Number.isFinite(close) || close <= 0) return [];
    return [{ date, close }];
  });
  return points.sort((left, right) => left.date.localeCompare(right.date)).at(-1) ?? null;
}

async function fetchEastmoneyClose(code: string, referenceDate: Date, onOrBeforeDate: string, fetchImpl: typeof fetch) {
  const beginDate = new Date(referenceDate.getTime() - 20 * 24 * 60 * 60 * 1000);
  const formatCompact = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.searchParams.set("secid", eastmoneySecurityId(code));
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56");
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "0");
  url.searchParams.set("beg", formatCompact(beginDate));
  url.searchParams.set("end", formatCompact(referenceDate));
  const response = await fetchImpl(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new ApiError(`股票参考行情查询失败（${response.status}）。`, 502);
  const point = parseEastmoneyDailyClose(await response.json(), onOrBeforeDate);
  if (!point) throw new ApiError("股票参考日之前暂无有效收盘价。", 502);
  return { ...point, source: "eastmoney" as const };
}

async function fetchSinaClose(code: string, onOrBeforeDate: string, fetchImpl: typeof fetch) {
  const url = new URL("https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_pcfHistory=/CN_MarketDataService.getKLineData");
  url.searchParams.set("symbol", `${/^[569]/.test(code) ? "sh" : "sz"}${code}`);
  url.searchParams.set("scale", "240");
  url.searchParams.set("ma", "no");
  url.searchParams.set("datalen", "1023");
  const response = await fetchImpl(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "text/plain,*/*", "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new ApiError(`新浪股票参考行情查询失败（${response.status}）。`, 502);
  const point = parseSinaDailyClose(await response.text(), onOrBeforeDate);
  if (!point) throw new ApiError("新浪未返回参考日之前的有效收盘价。", 502);
  return { ...point, source: "sina" as const };
}

export async function fetchChinaStockClose(code: string, onOrBeforeDate: string, fetchImpl: typeof fetch = fetch) {
  const referenceDate = parseDate(onOrBeforeDate);
  eastmoneySecurityId(code);
  try {
    return await fetchEastmoneyClose(code, referenceDate, onOrBeforeDate, fetchImpl);
  } catch {
    return fetchSinaClose(code, onOrBeforeDate, fetchImpl);
  }
}

export const stockPriceParsers = { parseEastmoneyDailyClose, parseSinaDailyClose, eastmoneySecurityId };

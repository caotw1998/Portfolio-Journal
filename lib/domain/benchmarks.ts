import type { BenchmarkInstrument } from "@prisma/client";
import { ApiError } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/domain/audit";
import { BENCHMARK_PROVIDERS, BENCHMARK_STATUSES } from "@/lib/domain/constants";
import { optionalString, parseBenchmarkProvider, parseBenchmarkStatus, parseJsonBody, requireDate, requireString } from "@/lib/domain/validation";
import { buildResearchComparison, type ResearchSeriesInput } from "@/lib/funds/comparison";

type HistoryPoint = { date: Date; closeValue: number };

export type BenchmarkSearchResult = {
  code: string;
  name: string;
  market: "SH" | "SZ" | "HK" | "GLOBAL";
  source: "eastmoney";
  sourceSymbol: string;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeMarket(value: string) {
  return value.trim().toUpperCase();
}

function equivalentMarkets(market: string) {
  return ["CN", "SH", "SZ"].includes(market) ? ["CN", "SH", "SZ"] : [market];
}

function normalizeSourceSymbol(value: unknown) {
  const sourceSymbol = optionalString(value, "sourceSymbol")?.trim().toUpperCase();
  if (!sourceSymbol) return undefined;
  if (!/^\d+\.[A-Z0-9^._-]+$/.test(sourceSymbol)) {
    throw new ApiError("sourceSymbol 格式无效。", 400);
  }
  return sourceSymbol;
}

function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function ensureProvider(value: string) {
  if (!BENCHMARK_PROVIDERS.includes(value as (typeof BENCHMARK_PROVIDERS)[number])) {
    throw new ApiError(`provider must be one of: ${BENCHMARK_PROVIDERS.join(", ")}.`, 400);
  }
}

function ensureStatus(value: string) {
  if (!BENCHMARK_STATUSES.includes(value as (typeof BENCHMARK_STATUSES)[number])) {
    throw new ApiError(`status must be one of: ${BENCHMARK_STATUSES.join(", ")}.`, 400);
  }
}

export function parseCreateBenchmarkInput(body: unknown) {
  const data = parseJsonBody(body);
  const provider = data.provider === undefined ? "public_market" : parseBenchmarkProvider(data.provider);
  ensureProvider(provider);
  return {
    code: normalizeCode(requireString(data.code, "code")),
    market: normalizeMarket(requireString(data.market, "market")),
    name: requireString(data.name, "name"),
    sourceSymbol: normalizeSourceSymbol(data.sourceSymbol),
    currency: optionalString(data.currency, "currency")?.toUpperCase(),
    provider,
  };
}

export function parseUpdateBenchmarkInput(body: unknown) {
  const data = parseJsonBody(body);
  const next = {
    code: data.code === undefined ? undefined : normalizeCode(requireString(data.code, "code")),
    market: data.market === undefined ? undefined : normalizeMarket(requireString(data.market, "market")),
    name: data.name === undefined ? undefined : requireString(data.name, "name"),
    currency: data.currency === undefined ? undefined : optionalString(data.currency, "currency")?.toUpperCase() ?? null,
    status: data.status === undefined ? undefined : parseBenchmarkStatus(data.status),
  };
  if (Object.values(next).every((value) => value === undefined)) throw new ApiError("至少提供一个要更新的字段。", 400);
  if (next.status) ensureStatus(next.status);
  return next;
}

async function ownedBenchmark(userId: string, benchmarkId: string) {
  const benchmark = await prisma.benchmarkInstrument.findFirst({ where: { id: benchmarkId, userId } });
  if (!benchmark) throw new ApiError("指数不存在。", 404);
  return benchmark;
}

export async function listBenchmarks(userId: string) {
  const rows = await prisma.benchmarkInstrument.findMany({
    where: { userId },
    include: { _count: { select: { priceSnapshots: true } }, priceSnapshots: { orderBy: { date: "desc" }, take: 1 } },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    market: row.market,
    name: row.name,
    sourceSymbol: row.sourceSymbol,
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    displayOrder: row.displayOrder,
    lastSyncAt: row.lastSyncAt,
    lastSyncError: row.lastSyncError,
    latestDate: row.priceSnapshots[0]?.date ?? null,
    pointCount: row._count.priceSnapshots,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function createBenchmark(userId: string, body: unknown) {
  const input = parseCreateBenchmarkInput(body);
  const duplicate = await prisma.benchmarkInstrument.findFirst({ where: { userId, code: input.code, market: { in: equivalentMarkets(input.market) } } });
  if (duplicate) throw new ApiError("相同代码和市场的指数已存在。", 409);
  return prisma.$transaction(async (tx) => {
    const last = await tx.benchmarkInstrument.findFirst({ where: { userId }, orderBy: { displayOrder: "desc" }, select: { displayOrder: true } });
    const created = await tx.benchmarkInstrument.create({ data: { userId, ...input, displayOrder: (last?.displayOrder ?? -1) + 1 } });
    await createAuditLog(tx, { userId, entityType: "benchmark_instrument", entityId: created.id, action: "create", source: "web", afterJson: created });
    return created;
  });
}

export async function updateBenchmark(userId: string, benchmarkId: string, body: unknown) {
  const before = await ownedBenchmark(userId, benchmarkId);
  const input = parseUpdateBenchmarkInput(body);
  const identityChanged = (input.code !== undefined && input.code !== before.code)
    || (input.market !== undefined && input.market !== before.market);
  if (identityChanged) {
    const nextCode = input.code ?? before.code;
    const nextMarket = input.market ?? before.market;
    const duplicate = await prisma.benchmarkInstrument.findFirst({
      where: {
        id: { not: benchmarkId },
        userId,
        code: nextCode,
        market: { in: equivalentMarkets(nextMarket) },
      },
    });
    if (duplicate) throw new ApiError("相同代码和市场的指数已存在。", 409);
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.benchmarkInstrument.update({
      where: { id: benchmarkId },
      data: {
        ...input,
        sourceSymbol: identityChanged ? null : undefined,
      },
    });
    await createAuditLog(tx, { userId, entityType: "benchmark_instrument", entityId: benchmarkId, action: "update", source: "web", beforeJson: before, afterJson: updated });
    return updated;
  });
}

export async function deleteBenchmark(userId: string, benchmarkId: string) {
  const before = await ownedBenchmark(userId, benchmarkId);
  await prisma.$transaction(async (tx) => {
    await tx.benchmarkInstrument.delete({ where: { id: benchmarkId } });
    await createAuditLog(tx, { userId, entityType: "benchmark_instrument", entityId: benchmarkId, action: "delete", source: "web", beforeJson: before });
  });
  return { id: benchmarkId };
}

export async function reorderBenchmarks(userId: string, body: unknown) {
  const data = parseJsonBody(body);
  if (!Array.isArray(data.benchmarkIds) || data.benchmarkIds.some((id) => typeof id !== "string")) {
    throw new ApiError("benchmarkIds 必须是字符串数组。", 400);
  }
  const benchmarkIds = Array.from(new Set(data.benchmarkIds as string[]));
  const owned = await prisma.benchmarkInstrument.count({ where: { userId, id: { in: benchmarkIds } } });
  if (owned !== benchmarkIds.length) throw new ApiError("排序中包含不存在的指数。", 404);
  await prisma.$transaction(benchmarkIds.map((id, displayOrder) => prisma.benchmarkInstrument.update({ where: { id }, data: { displayOrder } })));
  return listBenchmarks(userId);
}

function chinaSecId(code: string, market: string) {
  if (!/^\d{6}$/.test(code)) throw new ApiError("中国指数代码必须是 6 位数字。", 400);
  if (market === "SH" || (market === "CN" && code.startsWith("000"))) return `1.${code}`;
  return `0.${code}`;
}

function benchmarkSearchMarket(classify: string, sourceSymbol: string): BenchmarkSearchResult["market"] {
  if (classify === "Index") {
    if (sourceSymbol.startsWith("1.")) return "SH";
    if (sourceSymbol.startsWith("0.")) return "SZ";
  }
  if (classify === "HK") return "HK";
  return "GLOBAL";
}

export function parseBenchmarkSearchPayload(payload: unknown, query: string): BenchmarkSearchResult[] {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const table = root.QuotationCodeTable && typeof root.QuotationCodeTable === "object"
    ? root.QuotationCodeTable as Record<string, unknown>
    : {};
  const rows = Array.isArray(table.Data) ? table.Data : [];
  const normalizedQuery = query.trim().toUpperCase();
  const seen = new Set<string>();
  const results = rows.flatMap((row, sourceIndex): Array<BenchmarkSearchResult & { sourceIndex: number; score: number }> => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const code = typeof item.Code === "string" ? item.Code.trim().toUpperCase() : "";
    const name = typeof item.Name === "string" ? item.Name.trim() : "";
    const classify = typeof item.Classify === "string" ? item.Classify : "";
    const securityType = typeof item.SecurityType === "string" ? item.SecurityType : "";
    const securityTypeName = typeof item.SecurityTypeName === "string" ? item.SecurityTypeName : "";
    const sourceSymbol = typeof item.QuoteID === "string" ? item.QuoteID.trim().toUpperCase() : "";
    const isIndex = securityTypeName === "指数" || securityType === "5" || securityType === "11";
    if (!code || !name || !/^\d+\.[A-Z0-9^._-]+$/.test(sourceSymbol) || !isIndex || seen.has(sourceSymbol)) return [];
    seen.add(sourceSymbol);
    const score = code === normalizedQuery ? 0 : name.toUpperCase() === normalizedQuery ? 1 : 2;
    return [{ code, name, market: benchmarkSearchMarket(classify, sourceSymbol), source: "eastmoney", sourceSymbol, sourceIndex, score }];
  });

  return results
    .sort((left, right) => left.score - right.score || left.sourceIndex - right.sourceIndex)
    .slice(0, 20)
    .map((result) => ({
      code: result.code,
      name: result.name,
      market: result.market,
      source: result.source,
      sourceSymbol: result.sourceSymbol,
    }));
}

export async function searchPublicBenchmarks(query: string, fetchImpl: typeof fetch = fetch) {
  const normalized = query.trim();
  if (normalized.length < 2) throw new ApiError("请输入至少 2 个字符。", 400);
  if (normalized.length > 50) throw new ApiError("搜索关键词不能超过 50 个字符。", 400);
  const url = new URL("https://searchapi.eastmoney.com/api/suggest/get");
  url.searchParams.set("input", normalized);
  url.searchParams.set("type", "14");
  url.searchParams.set("count", "20");
  const response = await fetchImpl(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new ApiError(`指数搜索失败（${response.status}）。`, 502);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("指数搜索返回了无效数据。", 502);
  }
  return parseBenchmarkSearchPayload(payload, normalized);
}

async function fetchEastmoneyHistory(sourceSymbol: string, fetchImpl: typeof fetch) {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.searchParams.set("secid", sourceSymbol);
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53");
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "1");
  url.searchParams.set("beg", "19900101");
  url.searchParams.set("end", "20991231");
  const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new ApiError(`指数同步失败（${response.status}）。`, 502);
  const payload = await response.json() as { data?: { klines?: unknown[] } };
  const points = (payload.data?.klines ?? []).flatMap((line): HistoryPoint[] => {
    if (typeof line !== "string") return [];
    const [dateText, , closeText] = line.split(",");
    const date = dateText ? new Date(`${dateText}T00:00:00Z`) : new Date(Number.NaN);
    const closeValue = Number(closeText);
    return Number.isNaN(date.getTime()) || !Number.isFinite(closeValue) ? [] : [{ date, closeValue }];
  });
  if (!points.length) throw new ApiError("公开数据源未返回指数历史。", 502);
  return points;
}

async function fetchChinaHistory(instrument: Pick<BenchmarkInstrument, "code" | "market">, fetchImpl: typeof fetch) {
  return fetchEastmoneyHistory(chinaSecId(instrument.code, instrument.market), fetchImpl);
}

async function fetchCsindexHistory(instrument: Pick<BenchmarkInstrument, "code">, fetchImpl: typeof fetch) {
  const url = new URL("https://www.csindex.com.cn/csindex-home/perf/index-perf");
  url.searchParams.set("indexCode", instrument.code);
  url.searchParams.set("startDate", "19900101");
  url.searchParams.set("endDate", new Date().toISOString().slice(0, 10).replaceAll("-", ""));
  const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error("中证指数官方接口不可用。");
  const payload = await response.json() as { data?: Array<{ tradeDate?: string; close?: string | number }> };
  const points = (payload.data ?? []).flatMap((item): HistoryPoint[] => {
    const rawDate = item.tradeDate?.replaceAll("-", "");
    if (!rawDate || !/^\d{8}$/.test(rawDate)) return [];
    const date = new Date(`${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T00:00:00Z`);
    const closeValue = Number(item.close);
    return Number.isNaN(date.getTime()) || !Number.isFinite(closeValue) ? [] : [{ date, closeValue }];
  });
  if (!points.length) throw new Error("中证指数官方接口未返回历史。");
  return points;
}

async function fetchGlobalHistory(instrument: Pick<BenchmarkInstrument, "code">, fetchImpl: typeof fetch) {
  const aliases: Record<string, string> = {
    SPX: "^GSPC",
    NDX: "^NDX",
    HSI: "^HSI",
    DJIA: "^DJI",
    GDAXI: "^GDAXI",
    N225: "^N225",
    FTSE: "^FTSE",
  };
  const symbol = aliases[instrument.code] ?? instrument.code;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=100y`;
  const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new ApiError(`指数同步失败（${response.status}）。`, 502);
  const payload = await response.json() as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = payload.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  return (result?.timestamp ?? []).flatMap((timestamp, index): HistoryPoint[] => {
    const closeValue = closes[index];
    return typeof closeValue === "number" ? [{ date: utcDay(new Date(timestamp * 1000)), closeValue }] : [];
  });
}

async function fetchHistory(instrument: BenchmarkInstrument, fetchImpl: typeof fetch) {
  if (instrument.provider === "manual") throw new ApiError("手动指数不支持自动同步。", 400);
  const market = instrument.market.toUpperCase();
  let points: HistoryPoint[];
  if (["CN", "SH", "SZ"].includes(market)) {
    try {
      points = await fetchCsindexHistory(instrument, fetchImpl);
    } catch {
      points = instrument.sourceSymbol
        ? await fetchEastmoneyHistory(instrument.sourceSymbol, fetchImpl)
        : await fetchChinaHistory(instrument, fetchImpl);
    }
  } else if (instrument.sourceSymbol) {
    try {
      points = await fetchEastmoneyHistory(instrument.sourceSymbol, fetchImpl);
    } catch {
      points = await fetchGlobalHistory(instrument, fetchImpl);
    }
  } else {
    points = await fetchGlobalHistory(instrument, fetchImpl);
  }
  if (!points.length) throw new ApiError("公开数据源未返回指数历史。", 502);
  return points;
}

export async function syncBenchmarkHistory(userId: string, benchmarkId: string, fetchImpl: typeof fetch = fetch) {
  const benchmark = await ownedBenchmark(userId, benchmarkId);
  try {
    const points = await fetchHistory(benchmark, fetchImpl);
    return await prisma.$transaction(async (tx) => {
      await tx.benchmarkPriceSnapshot.deleteMany({ where: { benchmarkInstrumentId: benchmark.id } });
      await tx.benchmarkPriceSnapshot.createMany({ data: points.map((point) => ({ benchmarkInstrumentId: benchmark.id, date: utcDay(point.date), closeValue: point.closeValue, source: "public_market" })) });
      const updated = await tx.benchmarkInstrument.update({ where: { id: benchmark.id }, data: { status: "active", lastSyncAt: new Date(), lastSyncError: null } });
      await createAuditLog(tx, { userId, entityType: "benchmark_instrument", entityId: benchmark.id, action: "sync", source: "web", afterJson: { rows: points.length } });
      return updated;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "指数同步失败。";
    await prisma.benchmarkInstrument.update({ where: { id: benchmark.id }, data: { status: "sync_error", lastSyncError: message } });
    throw error;
  }
}

export async function syncAllBenchmarks(userId: string, fetchImpl: typeof fetch = fetch) {
  const benchmarks = await prisma.benchmarkInstrument.findMany({ where: { userId }, orderBy: { displayOrder: "asc" } });
  const results: Array<{ benchmarkId: string; status: "completed" | "skipped" | "failed"; error: string | null }> = [];
  for (const benchmark of benchmarks) {
    if (benchmark.provider === "manual") {
      results.push({ benchmarkId: benchmark.id, status: "skipped", error: null });
      continue;
    }
    try {
      await syncBenchmarkHistory(userId, benchmark.id, fetchImpl);
      results.push({ benchmarkId: benchmark.id, status: "completed", error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "指数同步失败。";
      results.push({ benchmarkId: benchmark.id, status: "failed", error: message });
    }
  }
  return { total: results.length, completed: results.filter((item) => item.status === "completed").length, skipped: results.filter((item) => item.status === "skipped").length, failed: results.filter((item) => item.status === "failed").length, results };
}

export async function listBenchmarkComparison(params: { userId: string; benchmarkIds: string[]; from?: Date; to?: Date }) {
  const ids = Array.from(new Set(params.benchmarkIds));
  if (!ids.length) return { series: [], comparisonRange: null, availableRange: null };
  const rows = await prisma.benchmarkInstrument.findMany({
    where: { userId: params.userId, id: { in: ids } },
    include: { priceSnapshots: { where: { date: { gte: params.from, lte: params.to } }, orderBy: { date: "asc" } } },
  });
  if (rows.length !== ids.length) throw new ApiError("包含不存在的指数。", 404);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const inputs: ResearchSeriesInput[] = ids.map((id) => {
    const row = byId.get(id)!;
    return { id, kind: "benchmark", name: row.name, code: row.code, basis: "close", points: row.priceSnapshots.map((point) => ({ date: point.date.toISOString().slice(0, 10), value: point.closeValue.toNumber() })) };
  });
  const result = buildResearchComparison(inputs);
  return {
    series: result.series.map((item) => ({ benchmarkId: item.id, name: item.name, code: item.code, market: byId.get(item.id)!.market, normalizedSeries: item.points.map((point) => ({ date: point.date, normalizedValue: point.normalizedValue, closeValue: point.value })), metrics: item.metrics })),
    comparisonRange: result.range,
    availableRange: result.range,
  };
}

export function parseBenchmarkIds(searchParams: URLSearchParams) {
  return (searchParams.get("benchmarkIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

export function parseOptionalDateRange(searchParams: URLSearchParams) {
  return {
    from: searchParams.get("from") ? requireDate(searchParams.get("from"), "from") : undefined,
    to: searchParams.get("to") ? requireDate(searchParams.get("to"), "to") : undefined,
  };
}

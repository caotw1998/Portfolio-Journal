import { ApiError } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { buildDividendAdjustedSeries, calculateSeriesMetrics } from "@/lib/funds/metrics";

const CATALOG = [
  { code: "600519", market: "CN", name: "贵州茅台", sourceSymbol: "1.600519", currency: "CNY" },
  { code: "0700", market: "HK", name: "腾讯控股", sourceSymbol: "0700.HK", currency: "HKD" },
  { code: "BRK-B", market: "US", name: "伯克希尔哈撒韦 B", sourceSymbol: "BRK-B", currency: "USD" },
];

function day(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }
function keyDate(value: Date) { return value.toISOString().slice(0, 10); }
function catalog(code: string) {
  const item = CATALOG.find((entry) => entry.code === code.trim().toUpperCase() || entry.name.includes(code.trim()));
  if (!item) throw new ApiError("目前仅支持可检索到的中美港股票。", 404);
  return item;
}
export async function searchStocks(query: string) {
  if (query.trim().length < 2) throw new ApiError("请输入至少 2 个字符。", 400);
  const q = query.trim().toUpperCase();
  return CATALOG.filter((item) => item.code.includes(q) || item.name.includes(query.trim())).slice(0, 20);
}
export async function listUserStocks(userId: string) {
  const rows = await prisma.userStock.findMany({ where: { userId }, include: { stock: { include: { priceSnapshots: { orderBy: { date: "desc" }, take: 1 }, dividendEvents: true } } }, orderBy: { createdAt: "desc" } });
  return rows.map(({ stock }) => {
    const prices = stock.priceSnapshots;
    return { ...stock, latestClose: prices[0]?.close.toNumber() ?? null, latestDate: prices[0]?.date ?? null, pointCount: prices.length };
  });
}
export async function addUserStock(userId: string, rawCode: unknown) {
  if (typeof rawCode !== "string") throw new ApiError("股票代码无效。", 400);
  const item = catalog(rawCode);
  const stock = await prisma.stock.upsert({ where: { code_market: { code: item.code, market: item.market } }, create: item, update: item });
  await prisma.userStock.upsert({ where: { userId_stockId: { userId, stockId: stock.id } }, create: { userId, stockId: stock.id }, update: {} });
  await syncStock(userId, stock.id);
  return stock;
}
async function yahooHistory(symbol: string) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "max"); url.searchParams.set("interval", "1d"); url.searchParams.set("events", "div");
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new ApiError(`股票行情同步失败（${response.status}）。`, 502);
  const root = await response.json() as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> }; events?: { dividends?: Record<string, { date?: number; amount?: number }> } }> } };
  const result = root.chart?.result?.[0]; const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const prices = (result?.timestamp ?? []).flatMap((timestamp, index) => typeof closes[index] === "number" && closes[index]! > 0 ? [{ date: day(new Date(timestamp * 1000)), close: closes[index]! }] : []);
  const dividends = Object.values(result?.events?.dividends ?? {}).flatMap((entry) => entry.date && entry.amount && entry.amount > 0 ? [{ exDate: day(new Date(entry.date * 1000)), amount: entry.amount }] : []);
  return { prices, dividends };
}
export async function syncStock(userId: string, stockId: string) {
  const owned = await prisma.userStock.findFirst({ where: { userId, stockId }, include: { stock: true } });
  if (!owned) throw new ApiError("股票不存在。", 404);
  try {
    const history = await yahooHistory(owned.stock.sourceSymbol);
    if (history.prices.length < 2) throw new ApiError("公开来源未返回足够的日收盘价。", 502);
    await prisma.$transaction(async (tx) => {
      await tx.stockPriceSnapshot.deleteMany({ where: { stockId } });
      await tx.stockDividendEvent.deleteMany({ where: { stockId } });
      await tx.stockPriceSnapshot.createMany({ data: history.prices.map((point) => ({ stockId, date: point.date, close: point.close, source: "yahoo" })) });
      if (history.dividends.length) await tx.stockDividendEvent.createMany({ data: history.dividends.map((event) => ({ stockId, exDate: event.exDate, amount: event.amount, source: "yahoo" })) });
      await tx.stock.update({ where: { id: stockId }, data: { latestSyncAt: new Date(), latestSyncError: null } });
    });
  } catch (error) { const message = error instanceof Error ? error.message : "股票同步失败。"; await prisma.stock.update({ where: { id: stockId }, data: { latestSyncError: message } }); throw error; }
}
export async function getStockDetail(userId: string, stockId: string) {
  const row = await prisma.userStock.findFirst({ where: { userId, stockId }, include: { stock: { include: { priceSnapshots: { orderBy: { date: "asc" } }, dividendEvents: true } } } });
  if (!row) throw new ApiError("股票不存在。", 404);
  const dividends = new Map(row.stock.dividendEvents.map((event) => [keyDate(event.exDate), event.amount.toNumber()]));
  const series = buildDividendAdjustedSeries(row.stock.priceSnapshots.map((point) => ({ date: keyDate(point.date), unitNav: point.close.toNumber(), dividendAmount: dividends.get(keyDate(point.date)) ?? 0 })));
  return { ...row.stock, prices: row.stock.priceSnapshots.map((point) => ({ date: keyDate(point.date), close: point.close.toNumber() })), dividends: row.stock.dividendEvents.map((event) => ({ exDate: keyDate(event.exDate), amount: event.amount.toNumber() })), metrics: calculateSeriesMetrics(series) };
}

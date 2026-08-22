import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DAY_MS = 86_400_000;

function utcDay(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function ensureDailyPriceDensity(prices) {
  if (prices.length < 2) throw new Error("公开来源未返回足够的日收盘价。");
  const historyDays = Math.floor((prices.at(-1).date.getTime() - prices[0].date.getTime()) / DAY_MS);
  if (historyDays >= 180 && prices.length < historyDays / 12) {
    throw new Error("公开来源返回的不是日线数据，已拒绝覆盖现有历史。");
  }
}

async function fetchYahooDailyHistory(symbol) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", "0");
  url.searchParams.set("period2", String(Math.floor(Date.now() / 1_000)));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div");
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`股票行情同步失败（${response.status}）。`);
  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const prices = (result?.timestamp ?? []).flatMap((timestamp, index) => (
    typeof closes[index] === "number" && closes[index] > 0
      ? [{ date: utcDay(new Date(timestamp * 1_000)), close: closes[index] }]
      : []
  ));
  ensureDailyPriceDensity(prices);
  const dividends = Object.values(result?.events?.dividends ?? {}).flatMap((event) => (
    event.date && event.amount && event.amount > 0
      ? [{ exDate: utcDay(new Date(event.date * 1_000)), amount: event.amount }]
      : []
  ));
  return { prices, dividends };
}

async function repairStock(stock) {
  const history = await fetchYahooDailyHistory(stock.sourceSymbol);
  await prisma.$transaction(async (tx) => {
    await tx.stockPriceSnapshot.deleteMany({ where: { stockId: stock.id } });
    await tx.stockDividendEvent.deleteMany({ where: { stockId: stock.id } });
    await tx.stockPriceSnapshot.createMany({
      data: history.prices.map((point) => ({ stockId: stock.id, date: point.date, close: point.close, source: "yahoo" })),
    });
    if (history.dividends.length) {
      await tx.stockDividendEvent.createMany({
        data: history.dividends.map((event) => ({ stockId: stock.id, exDate: event.exDate, amount: event.amount, source: "yahoo" })),
      });
    }
    await tx.stock.update({ where: { id: stock.id }, data: { latestSyncAt: new Date(), latestSyncError: null } });
  });
  process.stdout.write(`STOCK_DAILY_HISTORY_REPAIRED ${stock.code}.${stock.market} prices=${history.prices.length} dividends=${history.dividends.length}\n`);
}

try {
  const stocks = await prisma.stock.findMany({ select: { id: true, code: true, market: true, sourceSymbol: true }, orderBy: [{ market: "asc" }, { code: "asc" }] });
  let failed = 0;
  for (const stock of stocks) {
    try {
      await repairStock(stock);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "股票历史回填失败。";
      await prisma.stock.update({ where: { id: stock.id }, data: { latestSyncError: message } });
      process.stderr.write(`STOCK_DAILY_HISTORY_FAILED ${stock.code}.${stock.market} ${message}\n`);
    }
  }
  if (failed) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailPerformanceChart } from "@/components/fund-nav-chart";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { getStockDetail } from "@/lib/stocks/service";
export const dynamic = "force-dynamic";
export default async function StockPage({ params }: { params: Promise<{ stockId: string }> }) {
  const user = await requireWorkspaceUser(); let stock: Awaited<ReturnType<typeof getStockDetail>>;
  try { stock = await getStockDetail(user.id, (await params).stockId); } catch { notFound(); }
  const dividends = new Map(stock.dividends.map((item) => [item.exDate, item.amount]));
  return <AppShell currentPath={`/stocks/${stock.id}`}><section className="grid gap-4 border border-border bg-card p-5 sm:grid-cols-[1fr_auto]"><div><p className="font-mono text-xs text-muted-foreground">{stock.code} · {stock.market}</p><h1 className="mt-2 text-4xl font-semibold">{stock.name}</h1><p className="mt-2 text-sm text-muted-foreground">每日收盘价 · 分红再投资复权</p></div><div className="border border-border bg-background p-4"><p className="text-xs text-muted-foreground">最近同步</p><p className="mt-1 font-mono text-sm">{stock.latestSyncAt?.toISOString().slice(0, 10) ?? "--"}</p></div></section><section className="min-w-0 border border-border bg-card p-4 lg:p-6"><h2 className="text-2xl font-semibold">业绩与风险</h2><DetailPerformanceChart primaryId={stock.id} primaryKind="fund" primaryName={stock.name} primaryMarket={stock.market} points={stock.prices.map((point) => ({ date: point.date, unitNav: point.close, accumulatedNav: null, dividendAmount: dividends.get(point.date) ?? 0 }))} dividendEvents={stock.dividends.map((event) => ({ recordDate: null, exDate: event.exDate, paymentDate: null, amount: event.amount }))} managerTenures={[]} baselines={[]} chartSingleColor={user.chartSingleColor} chartSeriesColors={user.chartSeriesColors} /></section></AppShell>;
}

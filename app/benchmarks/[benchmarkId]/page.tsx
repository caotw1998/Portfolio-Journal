import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailPerformanceChart } from "@/components/fund-nav-chart";
import { BenchmarkValuationPanel } from "@/components/benchmark-valuation-panel";
import { BenchmarkConstituentHistory } from "@/components/benchmark-constituent-history";
import { BenchmarkDataImport } from "@/components/benchmark-data-import";
import { PageSectionNav } from "@/components/fund-section-nav";
import { ApiError } from "@/lib/api/responses";
import { getBenchmarkDetail } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { listDetailBaselineOptions } from "@/lib/funds/service";

export const dynamic = "force-dynamic";

const BENCHMARK_SECTIONS = [
  { id: "benchmark-overview", label: "指数概览" },
  { id: "benchmark-valuation", label: "估值位置" },
  { id: "benchmark-performance", label: "业绩风险" },
  { id: "benchmark-constituents", label: "成分股" },
];

export default async function BenchmarkDetailPage({ params }: { params: Promise<{ benchmarkId: string }> }) {
  const user = await requireWorkspaceUser();
  const { benchmarkId } = await params;
  let benchmark: Awaited<ReturnType<typeof getBenchmarkDetail>>;
  try {
    benchmark = await getBenchmarkDetail(user.id, benchmarkId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const baselines = await listDetailBaselineOptions(user.id);
  return (
    <AppShell currentPath="/benchmarks">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start">
        <PageSectionNav items={BENCHMARK_SECTIONS} ariaLabel="指数详情导航" title="指数研究" />
        <div className="min-w-0 space-y-5">
          <div id="benchmark-overview" className="scroll-mt-20">
            <section className="grid gap-5 border border-border bg-card p-5 lg:grid-cols-[1.35fr_0.65fr]">
              <div><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">{benchmark.code} · {benchmark.market}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">{benchmark.name}</h1><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="border border-border bg-background px-3 py-1.5">状态 {benchmark.status === "active" ? "已启用" : benchmark.status === "inactive" ? "已停用" : "同步异常"}</span>{benchmark.dataBasisLabel ? <span className="border border-[var(--warm-highlight)] bg-background px-3 py-1.5 text-[#9a4f2a]">{benchmark.dataBasisLabel}</span> : <span className="border border-border bg-background px-3 py-1.5">{benchmark.seriesType === "total_return" ? "全收益指数" : "价格指数"}</span>}{benchmark.parentIndexCode ? <span className="border border-border bg-background px-3 py-1.5">成分口径 {benchmark.parentIndexCode}</span> : null}</div></div>
              <dl className="grid grid-cols-2 gap-px bg-border"><div className="bg-background p-4"><dt className="text-xs text-muted-foreground">最新点位</dt><dd className="mt-2 text-3xl font-semibold">{benchmark.latestValue?.toFixed(2) ?? "--"}</dd></div><div className="bg-background p-4"><dt className="text-xs text-muted-foreground">数据日期</dt><dd className="mt-2 font-mono text-sm">{benchmark.latestDate ?? "--"}</dd></div><div className="col-span-2 bg-background p-4"><dt className="text-xs text-muted-foreground">数据状态</dt><dd className="mt-1 text-sm">{benchmark.pointCount} 个点 · {benchmark.lastSyncAt?.slice(0, 10) ?? "尚未同步"}{benchmark.lastSyncError ? ` · ${benchmark.lastSyncError}` : ""}</dd></div></dl>
              <div className="lg:col-span-2"><BenchmarkDataImport benchmarkId={benchmark.id} /></div>
            </section>
            {benchmark.dataBasis === "proxy_etf" ? <p className="mt-3 border-l-2 border-[var(--warm-highlight)] bg-card px-4 py-3 text-sm leading-6 text-[#9a4f2a]">精确指数历史不足，当前曲线采用红利低波50ETF南方（515450）前复权行情，仅作跟踪表现代理，不等同于指数原始点位。</p> : null}
            {benchmark.seriesType === "total_return" ? <p className="mt-3 border-l-2 border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">全收益指数按理论现金分红再投资计算；ETF展示的是基金净值分红再投资，仍会受建仓时点、费用、跟踪偏离与组合执行影响，因此两条曲线不要求完全重合。比较时系统自动使用双方共同日期。</p> : null}
          </div>
          <div id="benchmark-valuation" className="scroll-mt-20"><BenchmarkValuationPanel points={benchmark.valuationSnapshots} lastSyncAt={benchmark.valuationLastSyncAt} lastSyncError={benchmark.valuationLastSyncError} /></div>
          <section id="benchmark-performance" className="min-w-0 scroll-mt-20 overflow-hidden border border-border bg-card p-4 lg:p-6">
            <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-semibold lg:text-2xl">业绩与风险</h2><p className="font-mono text-xs text-muted-foreground">{benchmark.pointCount} 个观测点</p></div>
            <div className="mt-3 min-w-0">
              <DetailPerformanceChart
                primaryId={benchmark.id}
                primaryKind="benchmark"
                primaryName={benchmark.name}
                primaryMarket={benchmark.market}
                points={benchmark.series.points.map((point) => ({ date: point.date, unitNav: point.value, accumulatedNav: null, dailyReturn: null, dividendAmount: 0 }))}
                managerTenures={[]}
                baselines={baselines.filter((item) => !(item.kind === "benchmark" && item.id === benchmark.id))}
                chartSingleColor={user.chartSingleColor}
                chartSeriesColors={user.chartSeriesColors}
              />
            </div>
          </section>
          <div id="benchmark-constituents" className="scroll-mt-20"><BenchmarkConstituentHistory snapshots={benchmark.constituentSnapshots} lastSyncError={benchmark.constituentLastSyncError} /></div>
        </div>
      </div>
    </AppShell>
  );
}

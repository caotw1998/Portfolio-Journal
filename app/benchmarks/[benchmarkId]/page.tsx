import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BenchmarkDetailPerformance } from "@/components/benchmark-detail-performance";
import { ApiError } from "@/lib/api/responses";
import { getBenchmarkDetail } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export const dynamic = "force-dynamic";

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
  return (
    <AppShell currentPath="/benchmarks">
      <section className="grid gap-5 border border-border bg-card p-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">{benchmark.code} · {benchmark.market}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">{benchmark.name}</h1><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="border border-border bg-background px-3 py-1.5">状态 {benchmark.status}</span>{benchmark.dataBasisLabel ? <span className="border border-[var(--warm-highlight)] bg-background px-3 py-1.5 text-[#9a4f2a]">{benchmark.dataBasisLabel}</span> : <span className="border border-border bg-background px-3 py-1.5">指数原始数据</span>}</div></div>
        <dl className="grid grid-cols-2 gap-px bg-border"><div className="bg-background p-4"><dt className="text-xs text-muted-foreground">最新点位</dt><dd className="mt-2 text-3xl font-semibold">{benchmark.latestValue?.toFixed(2) ?? "--"}</dd></div><div className="bg-background p-4"><dt className="text-xs text-muted-foreground">数据日期</dt><dd className="mt-2 font-mono text-sm">{benchmark.latestDate ?? "--"}</dd></div><div className="col-span-2 bg-background p-4"><dt className="text-xs text-muted-foreground">数据状态</dt><dd className="mt-1 text-sm">{benchmark.pointCount} 个点 · {benchmark.lastSyncAt?.slice(0, 10) ?? "尚未同步"}{benchmark.lastSyncError ? ` · ${benchmark.lastSyncError}` : ""}</dd></div></dl>
      </section>
      {benchmark.dataBasis === "proxy_etf" ? <p className="border-l-2 border-[var(--warm-highlight)] bg-card px-4 py-3 text-sm leading-6 text-[#9a4f2a]">精确指数历史不足，当前曲线采用红利低波50ETF南方（515450）前复权行情，仅作跟踪表现代理，不等同于指数原始点位。</p> : null}
      <BenchmarkDetailPerformance points={benchmark.series.points} color={user.chartSingleColor} />
    </AppShell>
  );
}

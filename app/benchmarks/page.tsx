import { AppShell } from "@/components/app-shell";
import { BenchmarkManager } from "@/components/benchmark-manager";
import { PageSectionNav } from "@/components/fund-section-nav";
import {
  listBenchmarkComparison,
  listBenchmarks,
} from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export const dynamic = "force-dynamic";

export default async function BenchmarksPage() {
  const user = await requireWorkspaceUser();
  const benchmarks = await listBenchmarks(user.id);
  const initialIds: string[] = [];
  const initialComparison = await listBenchmarkComparison({
    userId: user.id,
    benchmarkIds: initialIds,
  });

  return (
    <AppShell currentPath="/benchmarks">
      <section className="rounded-[1.5rem] border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">基准指数库</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">基准管理与横向比较</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          这里维护用户级共享的比较基准。先录入指数代码和市场，再由服务端同步历史点位缓存；同步完成后，可以在这里横向比较多只指数，也可以在业绩页切换单个基准做净值对比。
        </p>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[10rem_minmax(0,1fr)] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[10rem_minmax(0,1fr)]"><PageSectionNav ariaLabel="指数库页内导航" items={[{ id: "benchmark-discovery", label: "发现指数" }, { id: "benchmark-library", label: "指数库" }, { id: "benchmark-comparison", label: "多指数比较" }]} /><BenchmarkManager
        initialBenchmarks={benchmarks.map((benchmark) => ({
          ...benchmark,
          latestDate: benchmark.latestDate?.toISOString() ?? null,
          lastSyncAt: benchmark.lastSyncAt?.toISOString() ?? null,
          createdAt: benchmark.createdAt.toISOString(),
          updatedAt: benchmark.updatedAt.toISOString(),
        }))}
        initialSelectedIds={initialIds}
        initialComparison={initialComparison}
        chartSingleColor={user.chartSingleColor}
        chartSeriesColors={user.chartSeriesColors}
      /></div>
    </AppShell>
  );
}

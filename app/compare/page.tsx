import { AppShell } from "@/components/app-shell";
import { ComparisonWorkbench } from "@/components/comparison-workbench";
import { listBenchmarks } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { listUserFunds } from "@/lib/funds/service";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const user = await requireWorkspaceUser();
  const [funds, benchmarks] = await Promise.all([listUserFunds(user.id), listBenchmarks(user.id)]);
  return <AppShell currentPath="/compare"><section className="border border-border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Cross Section</p><h1 className="mt-2 text-3xl font-semibold">基金与指数统一口径对比</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">按共同覆盖区间归一化，基金优先使用累计净值；指标在各自原始观测点计算，图表仅向后填充已知值。</p></section><ComparisonWorkbench funds={funds.map((fund) => ({ id: fund.id, name: fund.name ?? fund.code, code: fund.code }))} benchmarks={benchmarks.map((benchmark) => ({ id: benchmark.id, name: benchmark.name, code: benchmark.code }))} chartSingleColor={user.chartSingleColor} chartSeriesColors={user.chartSeriesColors} /></AppShell>;
}

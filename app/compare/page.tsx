import { AppShell } from "@/components/app-shell";
import { ComparisonWorkbench } from "@/components/comparison-workbench";
import { PageSectionNav } from "@/components/fund-section-nav";
import { listBenchmarks } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { listUserFunds } from "@/lib/funds/service";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const user = await requireWorkspaceUser();
  const [funds, benchmarks] = await Promise.all([listUserFunds(user.id), listBenchmarks(user.id)]);
  return <AppShell currentPath="/compare"><section className="border border-border bg-card p-5"><h1 className="text-3xl font-semibold">基金与指数统一口径对比</h1></section><div className="grid items-start gap-5 lg:grid-cols-[10rem_minmax(0,1fr)] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[10rem_minmax(0,1fr)]"><PageSectionNav ariaLabel="基金对比页内导航" items={[{ id: "comparison-selection", label: "选择标的" }, { id: "comparison-results", label: "对比结果" }]} /><ComparisonWorkbench funds={funds.map((fund) => ({ id: fund.id, name: fund.name ?? fund.code, code: fund.code }))} benchmarks={benchmarks.filter((benchmark) => benchmark.status === "active" && benchmark.pointCount > 0).map((benchmark) => ({ id: benchmark.id, name: benchmark.name, code: benchmark.code }))} chartSingleColor={user.chartSingleColor} chartSeriesColors={user.chartSeriesColors} /></div></AppShell>;
}

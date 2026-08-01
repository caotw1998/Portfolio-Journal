import { AppShell } from "@/components/app-shell";
import { ModelPortfolioWorkbench } from "@/components/model-portfolio-workbench";
import { PageSectionNav } from "@/components/fund-section-nav";
import { listBenchmarks } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { listUserFunds } from "@/lib/funds/service";
import { listModelPortfolios } from "@/lib/funds/model-portfolio-service";

export const dynamic = "force-dynamic";

export default async function ModelPortfoliosPage() {
  const user = await requireWorkspaceUser();
  const [funds, benchmarks, portfolios] = await Promise.all([listUserFunds(user.id), listBenchmarks(user.id), listModelPortfolios(user.id)]);
  return <AppShell currentPath="/model-portfolios">
    <section className="grid gap-5 border border-border bg-card p-5 md:grid-cols-[1fr_auto] md:items-end layout-mobile:grid-cols-1 layout-desktop:grid-cols-[1fr_auto] layout-desktop:items-end"><h1 className="text-3xl font-semibold tracking-tight">把研究判断放进同一套历史检验</h1><div className="border-l-2 border-[var(--warm-highlight)] pl-4"><p className="text-3xl font-semibold">{portfolios.length}</p><p className="text-xs text-muted-foreground">个模拟组合</p></div></section>
    <div className="grid items-start gap-5 lg:grid-cols-[10rem_minmax(0,1fr)] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[10rem_minmax(0,1fr)]"><PageSectionNav ariaLabel="模拟组合页内导航" items={[{ id: "portfolio-allocation", label: "目标权重" }, { id: "portfolio-backtests", label: "历史检验" }]} /><ModelPortfolioWorkbench
      funds={funds.map((fund) => ({ id: fund.id, code: fund.code, name: fund.name ?? fund.code }))}
      benchmarks={benchmarks.filter((item) => item.status === "active" && item.pointCount > 0).map((item) => ({ id: item.id, name: item.name, code: item.code }))}
      portfolios={portfolios.map((portfolio) => ({ id: portfolio.id, name: portfolio.name, startDate: portfolio.startDate.toISOString().slice(0, 10), rebalanceFrequency: portfolio.rebalanceFrequency, allocations: portfolio.allocations.map((allocation) => ({ fundId: allocation.fundId, name: allocation.fund.name ?? allocation.fund.code, targetWeight: allocation.targetWeight.toNumber() })) }))}
    /></div>
  </AppShell>;
}

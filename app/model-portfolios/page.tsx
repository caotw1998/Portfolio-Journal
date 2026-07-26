import { AppShell } from "@/components/app-shell";
import { ModelPortfolioWorkbench } from "@/components/model-portfolio-workbench";
import { listBenchmarks } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { listUserFunds } from "@/lib/funds/service";
import { listModelPortfolios } from "@/lib/funds/model-portfolio-service";

export const dynamic = "force-dynamic";

export default async function ModelPortfoliosPage() {
  const user = await requireWorkspaceUser();
  const [funds, benchmarks, portfolios] = await Promise.all([listUserFunds(user.id), listBenchmarks(user.id), listModelPortfolios(user.id)]);
  return <AppShell currentPath="/model-portfolios">
    <section className="grid gap-5 border border-border bg-card p-5 md:grid-cols-[1fr_auto] md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Model Portfolio Lab</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">把研究判断放进同一套历史检验</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">仅使用研究库基金的公开累计净值。目标权重最多 100%，余额视为现金；结果不代表真实交易或未来收益。</p></div><div className="border-l-2 border-[var(--warm-highlight)] pl-4"><p className="text-3xl font-semibold">{portfolios.length}</p><p className="text-xs text-muted-foreground">个模拟组合</p></div></section>
    <ModelPortfolioWorkbench
      funds={funds.map((fund) => ({ id: fund.id, code: fund.code, name: fund.name ?? fund.code }))}
      benchmarks={benchmarks.filter((item) => item.status === "active").map((item) => ({ id: item.id, name: item.name }))}
      portfolios={portfolios.map((portfolio) => ({ id: portfolio.id, name: portfolio.name, startDate: portfolio.startDate.toISOString().slice(0, 10), rebalanceFrequency: portfolio.rebalanceFrequency, allocations: portfolio.allocations.map((allocation) => ({ fundId: allocation.fundId, name: allocation.fund.name ?? allocation.fund.code, targetWeight: allocation.targetWeight.toNumber() })) }))}
    />
  </AppShell>;
}

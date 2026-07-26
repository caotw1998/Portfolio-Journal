import { AppShell } from "@/components/app-shell";
import { ResearchLibrary } from "@/components/research-library";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { listUserFunds } from "@/lib/funds/service";
import { listResearchCategories } from "@/lib/funds/research-category-service";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const user = await requireWorkspaceUser();
  const [funds, categories] = await Promise.all([listUserFunds(user.id), listResearchCategories(user.id)]);
  return (
    <AppShell currentPath="/research">
      <section className="grid gap-5 border border-border bg-card p-5 md:grid-cols-[1fr_auto] md:items-end">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Research Library</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">从资料采集开始建立基金判断</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">按需加入基金，首次同步净值、档案、经理、持仓与规模；缓存过期后按需更新，不依赖后台定时任务。</p></div>
        <div className="border-l-2 border-[var(--warm-highlight)] pl-4"><p className="text-3xl font-semibold">{funds.length}</p><p className="text-xs text-muted-foreground">只关注研究标的，不保存资金与交易</p></div>
      </section>
      <ResearchLibrary initialFunds={funds} categories={categories} />
    </AppShell>
  );
}

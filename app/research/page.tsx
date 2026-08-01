import { AppShell } from "@/components/app-shell";
import { ResearchLibrary } from "@/components/research-library";
import { PageSectionNav } from "@/components/fund-section-nav";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { listUserFunds } from "@/lib/funds/service";
import { listResearchCategories } from "@/lib/funds/research-category-service";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const user = await requireWorkspaceUser();
  const [funds, categories] = await Promise.all([listUserFunds(user.id), listResearchCategories(user.id)]);
  return (
    <AppShell currentPath="/research">
      <section className="grid gap-5 border border-border bg-card p-5 md:grid-cols-[1fr_auto] md:items-end layout-mobile:grid-cols-1 layout-desktop:grid-cols-[1fr_auto] layout-desktop:items-end">
        <h1 className="text-3xl font-semibold tracking-tight">从资料采集开始建立基金判断</h1>
        <div className="border-l-2 border-[var(--warm-highlight)] pl-4"><p className="text-3xl font-semibold">{funds.length}</p><p className="text-xs text-muted-foreground">只研究标的</p></div>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-[10rem_minmax(0,1fr)] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[10rem_minmax(0,1fr)]">
        <PageSectionNav ariaLabel="研究库页内导航" items={[{ id: "research-discovery", label: "发现基金" }, { id: "research-library", label: "我的研究库" }]} />
        <ResearchLibrary initialFunds={funds} categories={categories} />
      </div>
    </AppShell>
  );
}

import { AppShell } from "@/components/app-shell";
import { SettingsForms } from "@/components/settings-forms";
import { PageSectionNav } from "@/components/fund-section-nav";
import { requireWorkspaceUser } from "@/lib/domain/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireWorkspaceUser();

  return (
    <AppShell currentPath="/settings">
      <section className="rounded-[1.5rem] border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">设置中心</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">工作区设置</h1>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-[10rem_minmax(0,1fr)] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[10rem_minmax(0,1fr)]">
        <PageSectionNav ariaLabel="设置页内导航" items={[{ id: "workspace-profile", label: "工作区资料" }, { id: "chart-colors", label: "曲线颜色" }, { id: "feature-guide", label: "功能说明" }]} />
        <SettingsForms
          profile={{
            id: user.id,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
            chartSingleColor: user.chartSingleColor,
            chartSeriesColors: user.chartSeriesColors,
          }}
        />
      </div>
    </AppShell>
  );
}

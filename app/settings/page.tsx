import { AppShell } from "@/components/app-shell";
import { SettingsForms } from "@/components/settings-forms";
import { requireWorkspaceUser } from "@/lib/domain/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireWorkspaceUser();

  return (
    <AppShell currentPath="/settings">
      <section className="rounded-[1.5rem] border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">设置中心</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">工作区设置</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          查看当前研究工作区资料，并设置在页面中使用的显示名称。
        </p>
      </section>

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
    </AppShell>
  );
}

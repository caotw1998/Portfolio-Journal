import Link from "next/link";
import { cookies } from "next/headers";
import { LayoutModeControl, type LayoutMode } from "@/components/layout-mode-control";

const navigationItems = [
  { href: "/research", label: "研究库" },
  { href: "/compare", label: "基金对比" },
  { href: "/model-portfolios", label: "模拟组合" },
  { href: "/benchmarks", label: "指数库" },
  { href: "/settings", label: "设置" },
];

export async function AppShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  const cookieStore = await cookies();
  const storedMode = cookieStore.get("portfolio-layout-mode")?.value;
  const layoutMode: LayoutMode = storedMode === "mobile" || storedMode === "desktop" ? storedMode : "auto";
  return (
    <main className="min-h-screen overflow-x-clip bg-background">
        <div className="mx-auto flex w-full max-w-[1450px] flex-col gap-6 px-4 py-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-4 md:px-8 md:py-7 layout-mobile:max-w-[430px] layout-mobile:gap-4 layout-mobile:px-3 layout-mobile:py-3 layout-mobile:pb-[calc(4.75rem+env(safe-area-inset-bottom))] layout-desktop:max-w-[1450px] layout-desktop:px-8 layout-desktop:py-7">
          <header className="border border-border bg-card shadow-[0_20px_80px_rgba(54,45,31,0.08)]">
            <div className="grid gap-5 border-b border-border/80 bg-[linear-gradient(115deg,rgba(47,93,80,0.17),transparent_48%),radial-gradient(circle_at_80%_0%,rgba(201,131,82,0.22),transparent_30%)] px-5 py-5 md:grid-cols-[1fr_auto] md:px-7 layout-mobile:grid-cols-1 layout-mobile:px-4 layout-mobile:py-4 layout-desktop:grid-cols-[1fr_auto] layout-desktop:px-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  FUND RESEARCH DESK · CN
                </p>
                <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl layout-mobile:text-2xl layout-desktop:text-4xl">
                  基金研究台
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  搜集公开基金资料，沉淀净值与持仓档案，并用统一口径对照指数。
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-l border-border/80 pl-5 layout-mobile:border-l-0 layout-mobile:border-t layout-mobile:pl-0 layout-mobile:pt-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Workspace</p>
                  <p className="mt-1 text-sm font-medium">本地研究工作区</p>
                </div>
                <LayoutModeControl initialMode={layoutMode} />
              </div>
            </div>

            <nav aria-label="全站主导航" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-px border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-10px_30px_rgba(31,37,32,0.16)] sm:static sm:flex sm:flex-wrap sm:gap-2 sm:border-t-0 sm:px-5 sm:py-3 sm:shadow-none md:px-7 layout-mobile:fixed layout-mobile:inset-x-0 layout-mobile:bottom-0 layout-mobile:grid layout-mobile:grid-cols-5 layout-mobile:gap-px layout-mobile:border-t layout-mobile:px-1 layout-mobile:pb-[env(safe-area-inset-bottom)] layout-mobile:pt-1 layout-mobile:shadow-[0_-10px_30px_rgba(31,37,32,0.16)] layout-desktop:static layout-desktop:flex layout-desktop:flex-wrap layout-desktop:gap-2 layout-desktop:border-t-0 layout-desktop:px-7 layout-desktop:py-3 layout-desktop:shadow-none">
              {navigationItems.map((item) => {
                const isActive = currentPath === item.href;
                const isCurrent = isActive || currentPath.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`min-w-0 border px-1 py-2 text-center text-[11px] font-medium leading-tight transition-colors sm:px-4 sm:text-sm layout-mobile:px-1 layout-mobile:text-[11px] layout-desktop:px-4 layout-desktop:text-sm ${
                      isCurrent
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          {children}
        </div>
    </main>
  );
}

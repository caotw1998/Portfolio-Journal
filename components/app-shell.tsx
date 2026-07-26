import Link from "next/link";

const navigationItems = [
  { href: "/research", label: "研究库" },
  { href: "/compare", label: "基金对比" },
  { href: "/model-portfolios", label: "模拟组合" },
  { href: "/benchmarks", label: "指数库" },
  { href: "/settings", label: "设置" },
];

export function AppShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  return (
    <main className="min-h-screen bg-background">
        <div className="mx-auto flex w-full max-w-[1450px] flex-col gap-6 px-4 py-4 md:px-8 md:py-7">
          <header className="overflow-hidden border border-border bg-card shadow-[0_20px_80px_rgba(54,45,31,0.08)]">
            <div className="grid gap-5 border-b border-border/80 bg-[linear-gradient(115deg,rgba(47,93,80,0.17),transparent_48%),radial-gradient(circle_at_80%_0%,rgba(201,131,82,0.22),transparent_30%)] px-5 py-5 md:grid-cols-[1fr_auto] md:px-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  FUND RESEARCH DESK · CN
                </p>
                <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
                  基金研究台
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  搜集公开基金资料，沉淀净值与持仓档案，并用统一口径对照指数。
                </p>
              </div>
              <div className="flex items-center border-l border-border/80 pl-5">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Workspace</p>
                  <p className="mt-1 text-sm font-medium">本地研究工作区</p>
                </div>
              </div>
            </div>

            <nav className="flex flex-wrap gap-2 px-5 py-3 md:px-7">
              {navigationItems.map((item) => {
                const isActive = currentPath === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`border px-4 py-2 text-sm font-medium transition-colors ${
                      isActive || currentPath.startsWith(`${item.href}/`)
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

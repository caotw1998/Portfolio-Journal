"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type SearchResult = { code: string; name: string; market: string; type: string; source: string };
type ResearchCategory = { id: string; name: string; sortOrder: number };
type FundListItem = {
  id: string;
  code: string;
  name: string | null;
  type: string;
  company: string | null;
  latestSyncAt: string | null;
  latestSyncError: string | null;
  metrics: { maxDrawdown: number | null };
  latestScale: number | null;
  annualFees: { management: number | null; custodian: number | null; salesService: number | null; total: number | null; complete: boolean };
  topTenConcentration: number | null;
  dataQuality: { successfulSections: number; totalSections: number; score: number };
  categoryIds: string[];
  sourceSnapshots: Array<{ section: string; fetchedAt: string; expiresAt: string; error: string | null; status: string }>;
};

function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未同步";
}

export function ResearchLibrary({ initialFunds, categories }: { initialFunds: FundListItem[]; categories: ResearchCategory[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [sortKey, setSortKey] = useState<"name" | "maxDrawdown" | "scale" | "annualFee" | "quality">("quality");
  const [manageCategories, setManageCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>(() => Object.fromEntries(categories.map((category) => [category.id, category.name])));
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string[]>>({});

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const displayedFunds = useMemo(() => initialFunds
    .filter((fund) => activeCategoryId === "all" || (categoryOverrides[fund.id] ?? fund.categoryIds).includes(activeCategoryId))
    .sort((left, right) => {
      if (sortKey === "name") return (left.name ?? left.code).localeCompare(right.name ?? right.code, "zh-CN");
      if (sortKey === "quality") return right.dataQuality.score - left.dataQuality.score;
      if (sortKey === "scale") return (right.latestScale ?? Number.NEGATIVE_INFINITY) - (left.latestScale ?? Number.NEGATIVE_INFINITY);
      if (sortKey === "annualFee") return (left.annualFees.total ?? Number.POSITIVE_INFINITY) - (right.annualFees.total ?? Number.POSITIVE_INFINITY);
      return (right.metrics.maxDrawdown ?? Number.NEGATIVE_INFINITY) - (left.metrics.maxDrawdown ?? Number.NEGATIVE_INFINITY);
    }), [activeCategoryId, categoryOverrides, initialFunds, sortKey]);

  const percent = (value: number | null) => value === null ? "--" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
  const annualRate = (value: number | null) => value === null ? "--" : `${(value * 100).toFixed(2)}%`;

  function run(action: () => Promise<void>) {
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "操作失败。");
      }
    });
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    run(async () => {
      const response = await fetch(`/api/funds/search?q=${encodeURIComponent(query)}`);
      const body = await response.json() as { data?: SearchResult[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "搜索失败。");
      setResults(body.data ?? []);
      if (!body.data?.length) setMessage("没有找到匹配的中国公募基金。");
    });
  }

  function add(code: string) {
    run(async () => {
      setMessage("正在加入研究库并同步首批资料，这可能需要十几秒……");
      const response = await fetch("/api/funds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "加入失败。");
      setResults([]);
      setQuery("");
      setMessage("已加入研究库并完成首次同步，可在下方设置分类。");
      router.refresh();
    });
  }

  function sync(id?: string) {
    run(async () => {
      const endpoint = id ? `/api/funds/${id}/sync?force=true` : "/api/funds/sync?force=true";
      const response = await fetch(endpoint, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "刷新失败。");
      setMessage("公开资料已刷新。");
      router.refresh();
    });
  }

  function remove(id: string) {
    run(async () => {
      const response = await fetch(`/api/funds/${id}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "移除失败。");
      router.refresh();
    });
  }

  function updateFundCategories(fund: FundListItem, categoryId: string, checked: boolean) {
    const previousCategoryIds = categoryOverrides[fund.id] ?? fund.categoryIds;
    const categoryIds = checked
      ? Array.from(new Set([...previousCategoryIds, categoryId]))
      : previousCategoryIds.filter((id) => id !== categoryId);
    setCategoryOverrides((current) => ({ ...current, [fund.id]: categoryIds }));
    run(async () => {
      const response = await fetch(`/api/funds/${fund.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryIds }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        setCategoryOverrides((current) => ({ ...current, [fund.id]: previousCategoryIds }));
        throw new Error(body.error ?? "更新基金分类失败。");
      }
      router.refresh();
    });
  }

  function createCategory(event: React.FormEvent) {
    event.preventDefault();
    run(async () => {
      const response = await fetch("/api/research/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCategoryName }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "创建分类失败。");
      setNewCategoryName("");
      router.refresh();
    });
  }

  function renameCategory(category: ResearchCategory) {
    run(async () => {
      const response = await fetch(`/api/research/categories/${category.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: categoryDrafts[category.id] ?? category.name }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "分类改名失败。");
      router.refresh();
    });
  }

  function deleteCategory(category: ResearchCategory) {
    if (!window.confirm(`删除分类“${category.name}”？基金不会从研究库移除。`)) return;
    run(async () => {
      const response = await fetch(`/api/research/categories/${category.id}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "删除分类失败。");
      setCategoryOverrides((current) => Object.fromEntries(Object.entries(current).map(([fundId, ids]) => [fundId, ids.filter((id) => id !== category.id)])));
      if (activeCategoryId === category.id) setActiveCategoryId("all");
      router.refresh();
    });
  }

  function moveCategory(index: number, offset: -1 | 1) {
    const next = [...categories];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    run(async () => {
      const response = await fetch("/api/research/categories/order", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryIds: next.map((category) => category.id) }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "调整分类顺序失败。");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="border border-border bg-card p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Discover</p>
            <h2 className="mt-2 text-2xl font-semibold">搜索公开基金目录</h2>
            <form onSubmit={search} className="mt-4 flex max-w-4xl gap-2">
              <input aria-label="基金代码或名称" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="代码 / 名称，如 110022" className="min-w-0 flex-1 border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent" />
              <button disabled={isPending} className="bg-accent px-6 py-3 text-sm font-medium text-accent-foreground disabled:opacity-50">搜索</button>
            </form>
          </div>
          <p className="max-w-sm border-l-2 border-[var(--warm-highlight)] pl-4 text-xs leading-6 text-muted-foreground">按名称或代码发现基金。加入后再设置一个或多个自定义分类。</p>
        </div>
        {message ? <p aria-live="polite" className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p> : null}
        {results.length ? <div className="mt-5 grid gap-px border border-border bg-border md:grid-cols-2 xl:grid-cols-3">
          {results.map((fund) => <article key={`${fund.code}-${fund.market}`} className="grid grid-cols-[1fr_auto] items-center gap-3 bg-background p-4"><div><p className="font-medium">{fund.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{fund.code} · {fund.type}</p></div><button onClick={() => add(fund.code)} disabled={isPending} className="border border-accent px-3 py-2 text-xs font-semibold text-accent disabled:opacity-50">加入</button></article>)}
        </div> : null}
      </section>

      <section className="min-w-0 border border-border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-5">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Coverage · {initialFunds.length}</p><h2 className="mt-2 text-2xl font-semibold">我的研究库</h2></div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="排序方式" value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)} className="border border-border bg-background px-3 py-2 text-sm"><option value="quality">数据质量</option><option value="maxDrawdown">最大回撤</option><option value="scale">基金规模</option><option value="annualFee">年费率（低到高）</option><option value="name">基金名称</option></select>
            <button onClick={() => setManageCategories((current) => !current)} className="border border-border bg-background px-4 py-2 text-sm font-medium">{manageCategories ? "收起分类管理" : "管理分类"}</button>
            <button onClick={() => sync()} disabled={isPending || initialFunds.length === 0} className="border border-border bg-background px-4 py-2 text-sm font-medium disabled:opacity-50">全部刷新</button>
          </div>
        </div>

        <nav aria-label="研究库分类" className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3">
          <button onClick={() => setActiveCategoryId("all")} aria-current={activeCategoryId === "all" ? "page" : undefined} className={`shrink-0 px-3 py-1.5 text-sm ${activeCategoryId === "all" ? "bg-accent text-accent-foreground" : "border border-border bg-background"}`}>全部 <span className="ml-1 opacity-70">{initialFunds.length}</span></button>
          {categories.map((category) => {
            const count = initialFunds.filter((fund) => (categoryOverrides[fund.id] ?? fund.categoryIds).includes(category.id)).length;
            return <button key={category.id} onClick={() => setActiveCategoryId(category.id)} aria-current={activeCategoryId === category.id ? "page" : undefined} className={`shrink-0 px-3 py-1.5 text-sm ${activeCategoryId === category.id ? "bg-accent text-accent-foreground" : "border border-border bg-background"}`}>{category.name} <span className="ml-1 opacity-70">{count}</span></button>;
          })}
        </nav>

        {manageCategories ? <div className="border-b border-border bg-background/60 p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map((category, index) => <div key={category.id} className="grid grid-cols-[1fr_auto] gap-2 border border-border bg-card p-3">
                <input aria-label={`${category.name}分类名称`} value={categoryDrafts[category.id] ?? category.name} onChange={(event) => setCategoryDrafts((current) => ({ ...current, [category.id]: event.target.value }))} className="min-w-0 border border-border bg-background px-3 py-2 text-sm" />
                <button onClick={() => renameCategory(category)} disabled={isPending || categoryDrafts[category.id] === category.name} className="border border-accent px-3 text-xs text-accent disabled:opacity-40">保存</button>
                <div className="col-span-2 flex items-center justify-between"><div className="flex gap-1"><button aria-label={`上移${category.name}`} onClick={() => moveCategory(index, -1)} disabled={isPending || index === 0} className="border border-border px-2 py-1 text-xs disabled:opacity-30">↑</button><button aria-label={`下移${category.name}`} onClick={() => moveCategory(index, 1)} disabled={isPending || index === categories.length - 1} className="border border-border px-2 py-1 text-xs disabled:opacity-30">↓</button></div><button onClick={() => deleteCategory(category)} disabled={isPending} className="px-2 py-1 text-xs text-muted-foreground hover:text-red-700">删除</button></div>
              </div>)}
              {!categories.length ? <p className="py-4 text-sm text-muted-foreground">还没有自定义分类，“全部”仍会保留所有基金。</p> : null}
            </div>
            <form onSubmit={createCategory} className="border-l-2 border-[var(--warm-highlight)] pl-4"><p className="text-sm font-semibold">新增分类</p><p className="mt-1 text-xs leading-5 text-muted-foreground">最多20个分类；基金可以同时属于多个分类。</p><div className="mt-3 flex gap-2"><input aria-label="新分类名称" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="例如：红利策略" maxLength={24} className="min-w-0 flex-1 border border-border bg-card px-3 py-2 text-sm" /><button disabled={isPending || !newCategoryName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-accent-foreground disabled:opacity-40">创建</button></div></form>
          </div>
        </div> : null}

        {initialFunds.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">研究库还是空的。先从上方搜索一只基金。</div> : displayedFunds.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">这个分类还没有基金。可在“全部”中为基金勾选分类。</div> : <div className="overflow-x-auto"><div className="md:min-w-[860px]">
          <div className="hidden grid-cols-[2.3fr_.8fr_1fr_1.35fr_1.1fr_auto] gap-3 border-b border-border bg-background/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid"><span>基金</span><span>最大回撤</span><span>规模（亿元）</span><span>年费率</span><span>集中度 / 质量</span><span>操作</span></div>
          {displayedFunds.map((fund) => {
            const stale = fund.sourceSnapshots.some((source) => new Date(source.expiresAt) <= new Date());
            const fundCategoryIds = categoryOverrides[fund.id] ?? fund.categoryIds;
            return <article key={fund.id} className="group grid grid-cols-2 items-center gap-4 border-b border-border px-5 py-4 text-sm transition-colors last:border-0 hover:bg-background/70 md:grid-cols-[2.3fr_.8fr_1fr_1.35fr_1.1fr_auto] md:gap-3">
              <div className="col-span-2 md:col-span-1">
                <Link href={`/funds/${fund.id}`} className="font-semibold decoration-[var(--warm-highlight)] underline-offset-4 group-hover:underline">{fund.name ?? fund.code}</Link>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{fund.code} · {fund.type}</p>
                <details className="mt-2 text-[11px]"><summary className="cursor-pointer text-muted-foreground">分类 {fundCategoryIds.length ? fundCategoryIds.map((id) => categoryNames.get(id)).filter(Boolean).join(" / ") : "未设置"}</summary><div className="mt-2 grid gap-1 border-l-2 border-[var(--warm-highlight)] pl-2">{categories.map((category) => <label key={category.id} className="flex items-center gap-2"><input type="checkbox" checked={fundCategoryIds.includes(category.id)} onChange={(event) => updateFundCategories(fund, category.id, event.target.checked)} disabled={isPending} />{category.name}</label>)}{!categories.length ? <span className="text-muted-foreground">请先创建分类</span> : null}</div></details>
              </div>
              <span className="text-red-700"><small className="mb-1 block text-[10px] text-muted-foreground md:hidden">最大回撤</small>{percent(fund.metrics.maxDrawdown)}</span>
              <span><small className="mb-1 block text-[10px] text-muted-foreground md:hidden">规模</small>{fund.latestScale === null ? "--" : `${fund.latestScale.toFixed(1)} 亿元`}</span>
              <span><small className="mb-1 block text-[10px] text-muted-foreground md:hidden">年费率</small>{fund.annualFees.total === null ? "--" : `${fund.annualFees.complete ? "" : "≥"}${annualRate(fund.annualFees.total)} / 年`}<small className="mt-1 block leading-5 text-muted-foreground">管理 {annualRate(fund.annualFees.management)} · 托管 {annualRate(fund.annualFees.custodian)} · 销售 {annualRate(fund.annualFees.salesService)}</small></span>
              <span><small className="mb-1 block text-[10px] text-muted-foreground md:hidden">集中度 / 质量</small>{fund.topTenConcentration === null ? "--" : `${fund.topTenConcentration.toFixed(1)}%`}<small className={`block ${fund.latestSyncError ? "text-red-700" : stale ? "text-amber-700" : "text-accent"}`}>质量 {Math.round(fund.dataQuality.score * 100)}%</small></span>
              <div className="col-span-2 flex gap-1 md:col-span-1"><button title={`最后同步：${dateLabel(fund.latestSyncAt)}`} onClick={() => sync(fund.id)} disabled={isPending} className="border border-border px-2 py-2 text-xs">刷新</button><button onClick={() => remove(fund.id)} disabled={isPending} className="px-2 py-2 text-xs text-muted-foreground hover:text-red-700">移除</button></div>
            </article>;
          })}
        </div></div>}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  compareFollowedAtDescending,
  isFundInResearchCategory,
  UNCATEGORIZED_RESEARCH_CATEGORY_ID,
} from "@/lib/funds/research-library-view";

type SearchResult = {
  code: string;
  name: string;
  market: string;
  type: string;
  source: string;
  establishedDate: string | null;
};
type ResearchCategory = { id: string; name: string; sortOrder: number };
type FundSyncSummary = {
  fundCount: number;
  completedSections: number;
  failedSections: number;
};
type BenchmarkSyncSummary = {
  completed: number;
  skipped: number;
  failed: number;
};
type FundListItem = {
  id: string;
  code: string;
  name: string | null;
  type: string;
  company: string | null;
  latestSyncAt: string | null;
  latestSyncError: string | null;
  followedAt: string;
  metrics: { maxDrawdown: number | null };
  latestScale: number | null;
  annualFees: {
    management: number | null;
    custodian: number | null;
    salesService: number | null;
    total: number | null;
    complete: boolean;
  };
  topTenConcentration: number | null;
  dataQuality: {
    successfulSections: number;
    totalSections: number;
    score: number;
  };
  categoryIds: string[];
  sourceSnapshots: Array<{
    section: string;
    fetchedAt: string;
    expiresAt: string;
    error: string | null;
    status: string;
  }>;
};

function dateLabel(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "尚未同步";
}

export function ResearchLibrary({
  initialFunds,
  categories,
}: {
  initialFunds: FundListItem[];
  categories: ResearchCategory[];
}) {
  const [funds, setFunds] = useState(initialFunds);
  const [categoryList, setCategoryList] = useState(categories);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [globalSyncMessage, setGlobalSyncMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [sortKey, setSortKey] = useState<
    "followedAt" | "name" | "maxDrawdown" | "scale" | "annualFee" | "quality"
  >("quality");
  const [manageCategories, setManageCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        categories.map((category) => [category.id, category.name]),
      ),
  );
  const [categoryOverrides, setCategoryOverrides] = useState<
    Record<string, string[]>
  >({});
  const [expandedFundIds, setExpandedFundIds] = useState<string[]>([]);

  const categoryNames = useMemo(
    () => new Map(categoryList.map((category) => [category.id, category.name])),
    [categoryList],
  );
  const displayedFunds = useMemo(
    () =>
      funds
        .filter((fund) =>
          isFundInResearchCategory(
            categoryOverrides[fund.id] ?? fund.categoryIds,
            activeCategoryId,
          ),
        )
        .sort((left, right) => {
          if (sortKey === "followedAt")
            return compareFollowedAtDescending(left, right);
          if (sortKey === "name")
            return (left.name ?? left.code).localeCompare(
              right.name ?? right.code,
              "zh-CN",
            );
          if (sortKey === "quality")
            return right.dataQuality.score - left.dataQuality.score;
          if (sortKey === "scale")
            return (
              (right.latestScale ?? Number.NEGATIVE_INFINITY) -
              (left.latestScale ?? Number.NEGATIVE_INFINITY)
            );
          if (sortKey === "annualFee")
            return (
              (left.annualFees.total ?? Number.POSITIVE_INFINITY) -
              (right.annualFees.total ?? Number.POSITIVE_INFINITY)
            );
          return (
            (right.metrics.maxDrawdown ?? Number.NEGATIVE_INFINITY) -
            (left.metrics.maxDrawdown ?? Number.NEGATIVE_INFINITY)
          );
        }),
    [activeCategoryId, categoryOverrides, funds, sortKey],
  );

  const percent = (value: number | null) =>
    value === null
      ? "--"
      : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
  const annualRate = (value: number | null) =>
    value === null ? "--" : `${(value * 100).toFixed(2)}%`;

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

  async function refreshFunds() {
    const response = await fetch("/api/funds");
    const body = (await response.json()) as {
      data?: FundListItem[];
      error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? "研究库刷新失败。");
    setFunds(body.data ?? []);
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    run(async () => {
      const response = await fetch(
        `/api/funds/search?q=${encodeURIComponent(query)}`,
      );
      const body = (await response.json()) as {
        data?: SearchResult[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "搜索失败。");
      setResults(body.data ?? []);
      if (!body.data?.length) setMessage("没有找到匹配的中国公募基金。");
    });
  }

  function add(code: string) {
    run(async () => {
      setMessage("正在加入研究库并同步首批资料，这可能需要十几秒……");
      const response = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "加入失败。");
      await refreshFunds();
      setResults([]);
      setQuery("");
      setMessage("已加入研究库并完成首次同步，可在下方设置分类。");
    });
  }

  function sync(id?: string) {
    run(async () => {
      const endpoint = id
        ? `/api/funds/${id}/sync?force=true`
        : "/api/funds/sync?force=true";
      const response = await fetch(endpoint, { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "刷新失败。");
      await refreshFunds();
      setMessage("公开资料已刷新。");
    });
  }

  async function syncAllFundData(): Promise<FundSyncSummary> {
    const response = await fetch("/api/funds/sync?force=true", { method: "POST" });
    const body = (await response.json()) as {
      data?: { runId?: string; results?: unknown[] };
      error?: string;
    };
    if (!response.ok || !body.data?.runId) {
      throw new Error(body.error ?? "同步全部基金失败。");
    }

    await refreshFunds();
    const runResponse = await fetch(`/api/funds/sync/${body.data.runId}`);
    const runBody = (await runResponse.json()) as {
      data?: { items?: Array<{ status: string }> };
      error?: string;
    };
    if (!runResponse.ok || !runBody.data?.items) {
      throw new Error(runBody.error ?? "读取基金同步结果失败。");
    }

    return {
      fundCount: body.data.results?.length ?? 0,
      completedSections: runBody.data.items.filter((item) => item.status === "completed").length,
      failedSections: runBody.data.items.filter((item) => item.status === "failed").length,
    };
  }

  async function syncAllBenchmarkData(): Promise<BenchmarkSyncSummary> {
    const response = await fetch("/api/benchmarks/sync", { method: "POST" });
    const body = (await response.json()) as {
      data?: BenchmarkSyncSummary;
      error?: string;
    };
    if (!response.ok || !body.data) {
      throw new Error(body.error ?? "同步全部指数失败。");
    }
    return body.data;
  }

  function syncAllData() {
    setGlobalSyncMessage("正在同步全部基金与指数数据，这可能需要几分钟……");
    setIsGlobalSyncing(true);
    startTransition(async () => {
      try {
        const [fundResult, benchmarkResult] = await Promise.allSettled([
          syncAllFundData(),
          syncAllBenchmarkData(),
        ]);
        const fundSummary = fundResult.status === "fulfilled"
          ? `基金 ${fundResult.value.fundCount} 只（分区成功 ${fundResult.value.completedSections}、失败 ${fundResult.value.failedSections}）`
          : `基金失败：${fundResult.reason instanceof Error ? fundResult.reason.message : "未知错误"}`;
        const benchmarkSummary = benchmarkResult.status === "fulfilled"
          ? `指数成功 ${benchmarkResult.value.completed}、跳过 ${benchmarkResult.value.skipped}、失败 ${benchmarkResult.value.failed}`
          : `指数失败：${benchmarkResult.reason instanceof Error ? benchmarkResult.reason.message : "未知错误"}`;
        const bothFailed = fundResult.status === "rejected" && benchmarkResult.status === "rejected";
        const partiallyFailed = fundResult.status === "rejected"
          || benchmarkResult.status === "rejected"
          || fundResult.value.failedSections > 0
          || benchmarkResult.value.failed > 0;
        setGlobalSyncMessage(`${bothFailed ? "所有数据同步失败" : partiallyFailed ? "所有数据同步部分完成" : "所有数据同步完成"}：${fundSummary}；${benchmarkSummary}。`);
      } catch (error) {
        setGlobalSyncMessage(error instanceof Error ? error.message : "同步所有数据失败。");
      } finally {
        setIsGlobalSyncing(false);
      }
    });
  }

  function remove(id: string) {
    run(async () => {
      const response = await fetch(`/api/funds/${id}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "移除失败。");
      setFunds((current) => current.filter((fund) => fund.id !== id));
    });
  }

  function updateFundCategories(
    fund: FundListItem,
    categoryId: string,
    checked: boolean,
  ) {
    const previousCategoryIds = categoryOverrides[fund.id] ?? fund.categoryIds;
    const categoryIds = checked
      ? Array.from(new Set([...previousCategoryIds, categoryId]))
      : previousCategoryIds.filter((id) => id !== categoryId);
    setCategoryOverrides((current) => ({ ...current, [fund.id]: categoryIds }));
    run(async () => {
      const response = await fetch(`/api/funds/${fund.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setCategoryOverrides((current) => ({
          ...current,
          [fund.id]: previousCategoryIds,
        }));
        throw new Error(body.error ?? "更新基金分类失败。");
      }
    });
  }

  function createCategory(event: React.FormEvent) {
    event.preventDefault();
    run(async () => {
      const response = await fetch("/api/research/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName }),
      });
      const body = (await response.json()) as {
        data?: ResearchCategory;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "创建分类失败。");
      if (body.data) {
        setCategoryList((current) => [...current, body.data!]);
        setCategoryDrafts((current) => ({
          ...current,
          [body.data!.id]: body.data!.name,
        }));
      }
      setNewCategoryName("");
    });
  }

  function renameCategory(category: ResearchCategory) {
    run(async () => {
      const response = await fetch(`/api/research/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryDrafts[category.id] ?? category.name,
        }),
      });
      const body = (await response.json()) as {
        data?: ResearchCategory;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "分类改名失败。");
      if (body.data)
        setCategoryList((current) =>
          current.map((item) => (item.id === category.id ? body.data! : item)),
        );
    });
  }

  function deleteCategory(category: ResearchCategory) {
    if (!window.confirm(`删除分类“${category.name}”？基金不会从研究库移除。`))
      return;
    run(async () => {
      const response = await fetch(`/api/research/categories/${category.id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "删除分类失败。");
      setCategoryOverrides((current) =>
        Object.fromEntries(
          Object.entries(current).map(([fundId, ids]) => [
            fundId,
            ids.filter((id) => id !== category.id),
          ]),
        ),
      );
      if (activeCategoryId === category.id) setActiveCategoryId("all");
      setCategoryList((current) =>
        current.filter((item) => item.id !== category.id),
      );
    });
  }

  function moveCategory(index: number, offset: -1 | 1) {
    const next = [...categoryList];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    run(async () => {
      const response = await fetch("/api/research/categories/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryIds: next.map((category) => category.id),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "调整分类顺序失败。");
      setCategoryList(
        next.map((category, sortOrder) => ({ ...category, sortOrder })),
      );
    });
  }

  return (
    <div className="space-y-5">
      <section id="research-discovery" className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end layout-mobile:grid-cols-1 layout-desktop:grid-cols-[minmax(0,1fr)_auto] layout-desktop:items-end">
          <div>
            <h2 className="text-2xl font-semibold">搜索公开基金目录</h2>
            <form onSubmit={search} className="mt-4 flex max-w-4xl gap-2">
              <input
                aria-label="基金代码或名称"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="代码 / 名称，如 110022"
                className="min-w-0 flex-1 border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent"
              />
              <button
                disabled={isPending}
                className="bg-accent px-6 py-3 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                搜索
              </button>
            </form>
          </div>
          <p className="max-w-sm border-l-2 border-[var(--warm-highlight)] pl-4 text-xs leading-6 text-muted-foreground">
            按名称或代码发现基金。加入后再设置一个或多个自定义分类。
          </p>
        </div>
        {message ? (
          <p
            aria-live="polite"
            className="mt-3 text-sm leading-6 text-muted-foreground"
          >
            {message}
          </p>
        ) : null}
        {results.length ? (
          <div className="mt-5 grid gap-px border border-border bg-border md:grid-cols-2 xl:grid-cols-3 layout-mobile:grid-cols-1 layout-desktop:grid-cols-3">
            {results.map((fund) => (
              <article
                key={`${fund.code}-${fund.market}`}
                className="grid grid-cols-[1fr_auto] items-center gap-3 bg-background p-4"
              >
                <div>
                  <p className="font-medium">{fund.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {fund.code} · {fund.type}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    成立日期 {fund.establishedDate ?? "暂无披露"}
                  </p>
                </div>
                <button
                  onClick={() => add(fund.code)}
                  disabled={isPending}
                  className="border border-accent px-3 py-2 text-xs font-semibold text-accent disabled:opacity-50"
                >
                  加入
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section id="research-library" className="min-w-0 scroll-mt-20 border border-border bg-card lg:scroll-mt-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">收录 {funds.length} 只</p>
            <h2 className="mt-1 text-2xl font-semibold">我的研究库</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="排序方式"
              value={sortKey}
              onChange={(event) =>
                setSortKey(event.target.value as typeof sortKey)
              }
              className="border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="quality">数据质量</option>
              <option value="followedAt">最近添加</option>
              <option value="maxDrawdown">最大回撤</option>
              <option value="scale">基金规模</option>
              <option value="annualFee">年费率（低到高）</option>
              <option value="name">基金名称</option>
            </select>
            <button
              onClick={() => setManageCategories((current) => !current)}
              className="border border-border bg-background px-4 py-2 text-sm font-medium"
            >
              {manageCategories ? "收起分类管理" : "管理分类"}
            </button>
            <button
              type="button"
              aria-label="一键同步所有数据"
              onClick={syncAllData}
              disabled={isPending || isGlobalSyncing}
              className="border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {isGlobalSyncing ? "正在同步全部数据…" : "一键同步所有数据"}
            </button>
            <button
              onClick={() => sync()}
              disabled={isPending || funds.length === 0}
              className="border border-border bg-background px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              刷新全部基金
            </button>
          </div>
        </div>
        {globalSyncMessage ? <p aria-live="polite" className="border-b border-border px-5 py-3 text-sm leading-6 text-muted-foreground">{globalSyncMessage}</p> : null}

        <nav
          aria-label="研究库分类"
          className="flex flex-wrap gap-2 border-b border-border px-5 py-3"
        >
          <button
            onClick={() => setActiveCategoryId("all")}
            aria-current={activeCategoryId === "all" ? "page" : undefined}
            className={`shrink-0 px-3 py-1.5 text-sm ${activeCategoryId === "all" ? "bg-accent text-accent-foreground" : "border border-border bg-background"}`}
          >
            全部 <span className="ml-1 opacity-70">{funds.length}</span>
          </button>
          <button
            onClick={() =>
              setActiveCategoryId(UNCATEGORIZED_RESEARCH_CATEGORY_ID)
            }
            aria-current={
              activeCategoryId === UNCATEGORIZED_RESEARCH_CATEGORY_ID
                ? "page"
                : undefined
            }
            className={`shrink-0 px-3 py-1.5 text-sm ${activeCategoryId === UNCATEGORIZED_RESEARCH_CATEGORY_ID ? "bg-accent text-accent-foreground" : "border border-border bg-background"}`}
          >
            未分类{" "}
            <span className="ml-1 opacity-70">
              {
                funds.filter(
                  (fund) =>
                    (categoryOverrides[fund.id] ?? fund.categoryIds).length ===
                    0,
                ).length
              }
            </span>
          </button>
          {categoryList.map((category) => {
            const count = funds.filter((fund) =>
              (categoryOverrides[fund.id] ?? fund.categoryIds).includes(
                category.id,
              ),
            ).length;
            return (
              <button
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
                aria-current={
                  activeCategoryId === category.id ? "page" : undefined
                }
                className={`shrink-0 px-3 py-1.5 text-sm ${activeCategoryId === category.id ? "bg-accent text-accent-foreground" : "border border-border bg-background"}`}
              >
                {category.name} <span className="ml-1 opacity-70">{count}</span>
              </button>
            );
          })}
        </nav>

        {manageCategories ? (
          <div className="border-b border-border bg-background/60 p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 layout-mobile:grid-cols-1 layout-desktop:grid-cols-3">
                {categoryList.map((category, index) => (
                  <div
                    key={category.id}
                    className="grid grid-cols-[1fr_auto] gap-2 border border-border bg-card p-3"
                  >
                    <input
                      aria-label={`${category.name}分类名称`}
                      value={categoryDrafts[category.id] ?? category.name}
                      onChange={(event) =>
                        setCategoryDrafts((current) => ({
                          ...current,
                          [category.id]: event.target.value,
                        }))
                      }
                      className="min-w-0 border border-border bg-background px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => renameCategory(category)}
                      disabled={
                        isPending ||
                        categoryDrafts[category.id] === category.name
                      }
                      className="border border-accent px-3 text-xs text-accent disabled:opacity-40"
                    >
                      保存
                    </button>
                    <div className="col-span-2 flex items-center justify-between">
                      <div className="flex gap-1">
                        <button
                          aria-label={`上移${category.name}`}
                          onClick={() => moveCategory(index, -1)}
                          disabled={isPending || index === 0}
                          className="border border-border px-2 py-1 text-xs disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`下移${category.name}`}
                          onClick={() => moveCategory(index, 1)}
                          disabled={
                            isPending || index === categoryList.length - 1
                          }
                          className="border border-border px-2 py-1 text-xs disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        onClick={() => deleteCategory(category)}
                        disabled={isPending}
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-red-700"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
                {!categoryList.length ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    还没有自定义分类，“全部”仍会保留所有基金。
                  </p>
                ) : null}
              </div>
              <form
                onSubmit={createCategory}
                className="border-l-2 border-[var(--warm-highlight)] pl-4"
              >
                <p className="text-sm font-semibold">新增分类</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  最多20个分类；基金可以同时属于多个分类。
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    aria-label="新分类名称"
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="例如：红利策略"
                    maxLength={24}
                    className="min-w-0 flex-1 border border-border bg-card px-3 py-2 text-sm"
                  />
                  <button
                    disabled={isPending || !newCategoryName.trim()}
                    className="bg-accent px-4 py-2 text-xs font-medium text-accent-foreground disabled:opacity-40"
                  >
                    创建
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {funds.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            研究库还是空的。先从上方搜索一只基金。
          </div>
        ) : displayedFunds.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            这个分类还没有基金。可在“全部”中为基金勾选分类。
          </div>
        ) : (
          <div className="md:overflow-x-auto layout-mobile:overflow-visible layout-desktop:overflow-x-auto">
            <div className="md:min-w-[860px] layout-mobile:min-w-0 layout-desktop:min-w-[860px]">
              <div className="hidden grid-cols-[2.3fr_.8fr_1fr_1.35fr_1.1fr_auto] gap-3 border-b border-border bg-background/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid layout-mobile:hidden layout-desktop:grid">
                <span>基金</span>
                <span>最大回撤</span>
                <span>规模（亿元）</span>
                <span>年费率</span>
                <span>集中度 / 数据完整度</span>
                <span>操作</span>
              </div>
              {displayedFunds.map((fund) => {
                const stale = fund.sourceSnapshots.some(
                  (source) => new Date(source.expiresAt) <= new Date(),
                );
                const fundCategoryIds =
                  categoryOverrides[fund.id] ?? fund.categoryIds;
                const isExpanded = expandedFundIds.includes(fund.id);
                return (
                  <article
                    key={fund.id}
                    className="group border-b border-border px-4 py-4 text-sm transition-colors last:border-0 hover:bg-background/70 md:grid md:grid-cols-[2.3fr_.8fr_1fr_1.35fr_1.1fr_auto] md:items-center md:gap-3 md:px-5 layout-mobile:block layout-desktop:grid"
                  >
                    <div className="md:hidden layout-mobile:block layout-desktop:hidden">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/funds/${fund.id}`}
                            className="block truncate font-semibold decoration-[var(--warm-highlight)] underline-offset-4 group-hover:underline"
                          >
                            {fund.name ?? fund.code}
                          </Link>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {fund.code}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            title={`最后同步：${dateLabel(fund.latestSyncAt)}`}
                            onClick={() => sync(fund.id)}
                            disabled={isPending}
                            className="border border-border px-2 py-2 text-xs"
                          >
                            刷新
                          </button>
                          <button
                            onClick={() => remove(fund.id)}
                            disabled={isPending}
                            className="px-2 py-2 text-xs text-muted-foreground hover:text-red-700"
                          >
                            移除
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`fund-details-${fund.id}`}
                        onClick={() =>
                          setExpandedFundIds((current) =>
                            current.includes(fund.id)
                              ? current.filter((id) => id !== fund.id)
                              : [...current, fund.id],
                          )
                        }
                        className="mt-3 w-full border border-border bg-background px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                      >
                        {isExpanded ? "收起基金详情 ↑" : "展开基金详情 ↓"}
                      </button>
                      {isExpanded ? (
                        <div
                          id={`fund-details-${fund.id}`}
                          className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-l-2 border-[var(--warm-highlight)] bg-background/70 p-3"
                        >
                          <span>
                            <small className="mb-1 block text-[10px] text-muted-foreground">
                              基金类型
                            </small>
                            {fund.type}
                          </span>
                          <span>
                            <small className="mb-1 block text-[10px] text-muted-foreground">
                              添加日期
                            </small>
                            {new Date(fund.followedAt).toLocaleDateString(
                              "zh-CN",
                            )}
                          </span>
                          <span className="text-red-700">
                            <small className="mb-1 block text-[10px] text-muted-foreground">
                              最大回撤
                            </small>
                            {percent(fund.metrics.maxDrawdown)}
                          </span>
                          <span>
                            <small className="mb-1 block text-[10px] text-muted-foreground">
                              规模
                            </small>
                            {fund.latestScale === null
                              ? "--"
                              : `${fund.latestScale.toFixed(1)} 亿元`}
                          </span>
                          <span>
                            <small className="mb-1 block text-[10px] text-muted-foreground">
                              年费率
                            </small>
                            {fund.annualFees.total === null
                              ? "--"
                              : `${fund.annualFees.complete ? "" : "≥"}${annualRate(fund.annualFees.total)} / 年`}
                            <small className="mt-1 block leading-5 text-muted-foreground">
                              管理 {annualRate(fund.annualFees.management)} ·
                              托管 {annualRate(fund.annualFees.custodian)} ·
                              销售 {annualRate(fund.annualFees.salesService)}
                            </small>
                          </span>
                          <span>
                            <small className="mb-1 block text-[10px] text-muted-foreground">
                              集中度 / 数据完整度
                            </small>
                            {fund.topTenConcentration === null
                              ? "--"
                              : `${fund.topTenConcentration.toFixed(1)}%`}
                            <small
                              className={`block ${fund.latestSyncError ? "text-red-700" : stale ? "text-amber-700" : "text-accent"}`}
                            >
                              数据完整度{" "}
                              {Math.round(fund.dataQuality.score * 100)}%
                            </small>
                          </span>
                          <div className="col-span-2 text-[11px]">
                            <p className="text-muted-foreground">
                              分类{" "}
                              {fundCategoryIds.length
                                ? fundCategoryIds
                                    .map((id) => categoryNames.get(id))
                                    .filter(Boolean)
                                    .join(" / ")
                                : "未设置"}
                            </p>
                            <div className="mt-2 grid gap-1">
                              {categoryList.map((category) => (
                                <label
                                  key={category.id}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="checkbox"
                                    checked={fundCategoryIds.includes(
                                      category.id,
                                    )}
                                    onChange={(event) =>
                                      updateFundCategories(
                                        fund,
                                        category.id,
                                        event.target.checked,
                                      )
                                    }
                                    disabled={isPending}
                                  />
                                  {category.name}
                                </label>
                              ))}
                              {!categoryList.length ? (
                                <span className="text-muted-foreground">
                                  请先创建分类
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                <div className="hidden md:block layout-mobile:hidden layout-desktop:block">
                      <Link
                        href={`/funds/${fund.id}`}
                        className="font-semibold decoration-[var(--warm-highlight)] underline-offset-4 group-hover:underline"
                      >
                        {fund.name ?? fund.code}
                      </Link>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {fund.code} · {fund.type}
                      </p>
                      <details className="mt-2 text-[11px]">
                        <summary className="cursor-pointer text-muted-foreground">
                          分类{" "}
                          {fundCategoryIds.length
                            ? fundCategoryIds
                                .map((id) => categoryNames.get(id))
                                .filter(Boolean)
                                .join(" / ")
                            : "未设置"}
                        </summary>
                        <div className="mt-2 grid gap-1 border-l-2 border-[var(--warm-highlight)] pl-2">
                          {categoryList.map((category) => (
                            <label
                              key={category.id}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="checkbox"
                                checked={fundCategoryIds.includes(category.id)}
                                onChange={(event) =>
                                  updateFundCategories(
                                    fund,
                                    category.id,
                                    event.target.checked,
                                  )
                                }
                                disabled={isPending}
                              />
                              {category.name}
                            </label>
                          ))}
                          {!categoryList.length ? (
                            <span className="text-muted-foreground">
                              请先创建分类
                            </span>
                          ) : null}
                        </div>
                      </details>
                    </div>
                <span className="hidden text-red-700 md:block layout-mobile:hidden layout-desktop:block">
                      {percent(fund.metrics.maxDrawdown)}
                    </span>
                <span className="hidden md:block layout-mobile:hidden layout-desktop:block">
                      {fund.latestScale === null
                        ? "--"
                        : `${fund.latestScale.toFixed(1)} 亿元`}
                    </span>
                <span className="hidden md:block layout-mobile:hidden layout-desktop:block">
                      {fund.annualFees.total === null
                        ? "--"
                        : `${fund.annualFees.complete ? "" : "≥"}${annualRate(fund.annualFees.total)} / 年`}
                      <small className="mt-1 block leading-5 text-muted-foreground">
                        管理 {annualRate(fund.annualFees.management)} · 托管{" "}
                        {annualRate(fund.annualFees.custodian)} · 销售{" "}
                        {annualRate(fund.annualFees.salesService)}
                      </small>
                    </span>
                <span className="hidden md:block layout-mobile:hidden layout-desktop:block">
                      {fund.topTenConcentration === null
                        ? "--"
                        : `${fund.topTenConcentration.toFixed(1)}%`}
                      <small
                        className={`block ${fund.latestSyncError ? "text-red-700" : stale ? "text-amber-700" : "text-accent"}`}
                      >
                        数据完整度 {Math.round(fund.dataQuality.score * 100)}%
                      </small>
                    </span>
                <div className="hidden gap-1 md:flex layout-mobile:hidden layout-desktop:flex">
                      <button
                        title={`最后同步：${dateLabel(fund.latestSyncAt)}`}
                        onClick={() => sync(fund.id)}
                        disabled={isPending}
                        className="border border-border px-2 py-2 text-xs"
                      >
                        刷新
                      </button>
                      <button
                        onClick={() => remove(fund.id)}
                        disabled={isPending}
                        className="px-2 py-2 text-xs text-muted-foreground hover:text-red-700"
                      >
                        移除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

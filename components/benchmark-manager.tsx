"use client";

import type { EChartsOption } from "echarts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ChartRangeControls } from "@/components/chart-range-controls";
import { ThemedEChart } from "@/components/charts/themed-echart";
import { ResponsiveDisclosure } from "@/components/responsive-disclosure";
import { buildPaddedValueAxisDomain } from "@/lib/chart-axis-domain";
import { searchLibraryOptions } from "@/lib/funds/library-search";
import {
  formatAxisDateLabel,
  formatEdgeAxisDateLabel,
  isValidDateKey,
  type ChartDateRange,
  type ChartRangePreset,
  resolveRangeInputDefaults,
  resolvePresetRange,
} from "@/lib/chart-time-range";
import {
  drawdownToneClass,
  returnToneClass,
} from "@/lib/visual-tones";

const chartPalette = {
  background: "#f4efe6",
  foreground: "#1f2520",
  mutedForeground: "#5e675d",
  border: "#d7c8af",
  accent: "#2f5d50",
  warmHighlight: "#c98352",
};

type BenchmarkListItem = {
  id: string;
  code: string;
  market: string;
  name: string;
  sourceSymbol?: string | null;
  currency: string | null | undefined;
  provider: string;
  status: string;
  displayOrder: number;
  lastSyncAt: string | null;
  lastSyncError: string | null | undefined;
  latestDate: string | null;
  pointCount: number;
  dataBasis: "index" | "proxy_etf";
  dataBasisLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

type BenchmarkSearchResult = {
  code: string;
  name: string;
  market: "CN" | "SH" | "SZ" | "HK" | "GLOBAL";
  source: "csindex" | "eastmoney" | "yahoo" | "spglobal";
  sourceSymbol: string;
};

function isSameBenchmark(left: Pick<BenchmarkListItem, "code" | "market">, right: Pick<BenchmarkSearchResult, "code" | "market">) {
  if (left.code !== right.code) return false;
  const chinaMarkets = new Set(["CN", "SH", "SZ"]);
  return left.market === right.market || chinaMarkets.has(left.market) && chinaMarkets.has(right.market);
}

type BenchmarkComparison = {
  series: Array<{
    benchmarkId: string;
    name: string;
    code: string;
    market: string;
    dataBasis: "index" | "proxy_etf";
    dataBasisLabel: string | null;
    normalizedSeries: Array<{
      date: string;
      normalizedValue: number;
      closeValue: number;
    }>;
    metrics: {
      rangeReturn: number | null;
      annualizedReturn: number | null;
      maxDrawdown: number | null;
      volatility: number | null;
      sharpeRatio: number | null;
    };
  }>;
  comparisonRange: {
    from: string;
    to: string;
  } | null;
  availableRange: {
    from: string;
    to: string;
  } | null;
};

function formatPercent(value: number | null) {
  if (value === null) {
    return "--";
  }

  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "--";
  }

  return value.toFixed(2);
}

function getComparisonSeriesColor(seriesCount: number, seriesIndex: number, chartSingleColor: string, chartSeriesColors: string[]) {
  if (seriesCount === 1) {
    return chartSingleColor;
  }

  return chartSeriesColors[
    seriesIndex % chartSeriesColors.length
  ];
}

function buildComparisonChartOption(comparison: BenchmarkComparison, chartSingleColor: string, chartSeriesColors: string[]): EChartsOption {
  const chartDates = comparison.series[0]?.normalizedSeries.map((point) => point.date) ?? [];
  const yAxisDomain = buildPaddedValueAxisDomain(
    comparison.series.flatMap((series) =>
      series.normalizedSeries.map((point) => point.normalizedValue),
    ),
    {
      minSpan: 0.08,
    },
  );

  return {
    animationDuration: 700,
    grid: {
      left: 16,
      right: 112,
      top: 24,
      bottom: 30,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "line",
        snap: true,
      },
      backgroundColor: chartPalette.background,
      borderColor: chartPalette.border,
      textStyle: {
        color: chartPalette.foreground,
      },
      formatter: (params) => {
        const points = Array.isArray(params) ? params : [params];
        const firstPoint = points[0] as (typeof points)[number] & {
          axisValue?: unknown;
        };
        const axisDate =
          typeof firstPoint?.axisValue === "string"
            ? firstPoint.axisValue
            : typeof firstPoint?.axisValue === "number"
              ? (chartDates[firstPoint.axisValue] ?? "")
              : "";

        const lines = [`<div>${axisDate}</div>`];

        for (const point of points) {
          const seriesName = typeof point.seriesName === "string" ? point.seriesName : "";
          const normalizedValue =
            Array.isArray(point.value) && typeof point.value[1] === "number"
              ? point.value[1]
              : typeof point.value === "number"
                ? point.value
                : null;
          const closeValue =
            Array.isArray(point.value) && typeof point.value[2] === "number"
              ? point.value[2]
              : null;
          const marker =
            typeof point.marker === "string"
              ? point.marker
              : `<span style="display:inline-block;margin-right:6px;border-radius:50%;width:8px;height:8px;background-color:${String(
                  point.color ?? chartPalette.accent,
                )}"></span>`;

          lines.push(
            `<div>${marker}${seriesName} ${normalizedValue?.toFixed(3) ?? "--"}${
              closeValue !== null ? ` · 点位 ${closeValue.toFixed(2)}` : ""
            }</div>`,
          );
        }

        return lines.join("");
      },
    },
    legend: {
      top: 0,
      textStyle: {
        color: chartPalette.mutedForeground,
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: chartDates,
      axisLabel: {
        color: chartPalette.mutedForeground,
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: true,
        interval: (index: number) => {
          if (index === 0 || index === chartDates.length - 1) {
            return true;
          }

          const total = Math.max(chartDates.length, 1);
          const step = Math.max(Math.ceil(total / 10), 1);
          return index % step === 0;
        },
        formatter: (value: string, index: number) => {
          if (index === 0 || index === chartDates.length - 1) {
            return formatEdgeAxisDateLabel(value);
          }

          return formatAxisDateLabel(value, index, chartDates);
        },
      },
      axisLine: {
        lineStyle: {
          color: chartPalette.border,
        },
      },
    },
    yAxis: {
      type: "value",
      min: yAxisDomain.min,
      max: yAxisDomain.max,
      axisLabel: {
        color: chartPalette.mutedForeground,
        formatter: (value: number) => value.toFixed(2),
      },
      splitLine: {
        lineStyle: {
          color: chartPalette.border,
          opacity: 0.45,
        },
      },
    },
    series: comparison.series.map((series, index) => {
      const color = getComparisonSeriesColor(comparison.series.length, index, chartSingleColor, chartSeriesColors);
      const latestPoint = series.normalizedSeries.at(-1);

      return {
        name: `${series.name} (${series.code})${series.dataBasisLabel ? ` · ${series.dataBasisLabel}` : ""}`,
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: (value: unknown) => {
          const date = Array.isArray(value) ? value[0] : null;
          return date === latestPoint?.date ? 14 : 0;
        },
        showSymbol: true,
        triggerLineEvent: true,
        lineStyle: {
          width: 3,
          color,
        },
        itemStyle: {
          color,
        },
        color,
        data: series.normalizedSeries.map((point) => [
          point.date,
          point.normalizedValue,
          point.closeValue,
        ]),
        markPoint: latestPoint
          ? {
              symbol: "circle",
              symbolSize: 10,
              itemStyle: {
                color,
                borderColor: chartPalette.background,
                borderWidth: 2,
              },
              label: {
                show: false,
              },
              data: [
                {
                  name: "最新",
                  coord: [latestPoint.date, latestPoint.normalizedValue],
                  value: latestPoint.closeValue,
                },
              ],
            }
          : undefined,
      };
    }),
  };
}

export function BenchmarkManager({
  initialBenchmarks,
  initialSelectedIds,
  initialComparison,
  chartSingleColor,
  chartSeriesColors,
}: {
  initialBenchmarks: BenchmarkListItem[];
  initialSelectedIds: string[];
  initialComparison: BenchmarkComparison;
  chartSingleColor: string;
  chartSeriesColors: string[];
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [market, setMarket] = useState("");
  const [name, setName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BenchmarkSearchResult[]>([]);
  const [editingBenchmarkId, setEditingBenchmarkId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState("");
  const [editingMarket, setEditingMarket] = useState("");
  const [editingName, setEditingName] = useState("");
  const [editingCurrency, setEditingCurrency] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [benchmarkList, setBenchmarkList] = useState(initialBenchmarks);
  const [draggingBenchmarkId, setDraggingBenchmarkId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [comparisonQuery, setComparisonQuery] = useState("");
  const [comparison, setComparison] = useState<BenchmarkComparison>(initialComparison);
  const [rangePreset, setRangePreset] = useState<ChartRangePreset>("inception");
  const [customFrom, setCustomFrom] = useState(
    resolveRangeInputDefaults(initialComparison.availableRange, initialComparison.comparisonRange, {
      from: "",
      to: "",
    }).from,
  );
  const [customTo, setCustomTo] = useState(
    resolveRangeInputDefaults(initialComparison.availableRange, initialComparison.comparisonRange, {
      from: "",
      to: "",
    }).to,
  );
  const [requestedRange, setRequestedRange] = useState<ChartDateRange | null>(null);
  const [comparisonReloadKey, setComparisonReloadKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  function buildRequestedRange(
    nextPreset: ChartRangePreset,
    nextCustomFrom: string,
    nextCustomTo: string,
  ) {
    const availableRange = comparison.availableRange;

    if (nextPreset === "inception" || !availableRange) {
      return null;
    }

    if (nextPreset === "custom") {
      if (!isValidDateKey(nextCustomFrom) || !isValidDateKey(nextCustomTo)) {
        throw new Error("请输入有效日期，格式为 YYYY-MM-DD。");
      }

      if (nextCustomFrom > nextCustomTo) {
        throw new Error("自定义起始日期不能晚于结束日期。");
      }

      return {
        from: nextCustomFrom,
        to: nextCustomTo,
      };
    }

    return resolvePresetRange(
      nextPreset,
      availableRange,
      comparison.series[0]?.normalizedSeries.map((point) => point.date) ?? [],
    );
  }

  useEffect(() => {
    if (selectedIds.length === 0) {
      return;
    }

    let cancelled = false;

    async function loadComparison() {
      try {
        const query = new URLSearchParams({
          benchmarkIds: selectedIds.join(","),
        });
        if (requestedRange) {
          query.set("from", requestedRange.from);
          query.set("to", requestedRange.to);
        }

        const response = await fetch(`/api/benchmarks/compare?${query.toString()}`);
        const result = (await response.json()) as {
          data?: BenchmarkComparison;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "加载基准对比失败。");
        }

        if (!cancelled) {
          const nextComparison = result.data ?? {
              series: [],
              comparisonRange: null,
              availableRange: null,
            };
          const nextInputRange = resolveRangeInputDefaults(
            nextComparison.availableRange,
            nextComparison.comparisonRange,
            { from: "", to: "" },
          );

          setComparison(nextComparison);
          if (rangePreset !== "custom") {
            setCustomFrom(nextInputRange.from);
            setCustomTo(nextInputRange.to);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error ? error.message : "加载基准对比失败。",
          );
        }
      }
    }

    loadComparison();

    return () => {
      cancelled = true;
    };
  }, [selectedIds, requestedRange, comparisonReloadKey, rangePreset]);

  async function loadBenchmarkList() {
    const response = await fetch("/api/benchmarks");
    const result = (await response.json()) as {
      data?: BenchmarkListItem[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(result.error ?? "刷新基准列表失败。");
    }

    setBenchmarkList(result.data ?? []);
  }

  async function createAndSyncBenchmark(input: {
    code: string;
    market: string;
    name: string;
    sourceSymbol?: string;
  }) {
    const response = await fetch("/api/benchmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = (await response.json()) as {
      data?: { id?: string };
      error?: string;
    };
    if (!response.ok || !result.data?.id) {
      throw new Error(result.error ?? "创建基准失败。");
    }

    const syncResponse = await fetch(`/api/benchmarks/${result.data.id}/sync`, { method: "POST" });
    const syncResult = (await syncResponse.json()) as { error?: string };
    await loadBenchmarkList();
    setComparisonReloadKey((current) => current + 1);
    router.refresh();
    return syncResponse.ok ? null : syncResult.error ?? "首轮同步失败。";
  }

  function handleBenchmarkSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/benchmarks/search?q=${encodeURIComponent(searchQuery)}`);
        const result = (await response.json()) as { data?: BenchmarkSearchResult[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "搜索指数失败。");
        setSearchResults(result.data ?? []);
        if (!result.data?.length) setMessage("没有找到匹配的公开指数，可使用下方手工录入。");
      } catch (error) {
        setSearchResults([]);
        setMessage(error instanceof Error ? error.message : "搜索指数失败。");
      }
    });
  }

  function addSearchResult(candidate: BenchmarkSearchResult) {
    setMessage("正在加入指数库并同步历史数据……");
    startTransition(async () => {
      try {
        const syncError = await createAndSyncBenchmark(candidate);
        setSearchQuery("");
        setSearchResults([]);
        setMessage(syncError ? `指数已录入，但首轮同步失败：${syncError}` : "指数已加入并完成首轮同步。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "加入指数失败。");
      }
    });
  }

  function handleCreateBenchmark(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      try {
        const syncError = await createAndSyncBenchmark({ code, market, name });
        setCode("");
        setMarket("");
        setName("");
        setMessage(syncError ? `基准已录入，但首轮同步失败：${syncError}` : "基准已创建并完成首轮同步。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "创建基准失败。");
      }
    });
  }

  function triggerSync(benchmarkId: string) {
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/benchmarks/${benchmarkId}/sync`, {
          method: "POST",
        });
        const result = (await response.json()) as {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "同步基准失败。");
        }

        await loadBenchmarkList();
        setComparisonReloadKey((current) => current + 1);
        setMessage("基准历史数据已同步。");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "同步基准失败。");
      }
    });
  }

  function triggerSyncAll() {
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/benchmarks/sync", {
          method: "POST",
        });
        const result = (await response.json()) as {
          data?: {
            total: number;
            completed: number;
            skipped: number;
            failed: number;
          };
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "同步全部基准失败。");
        }

        await loadBenchmarkList();
        setComparisonReloadKey((current) => current + 1);
        setMessage(
          `基准已同步：成功 ${result.data?.completed ?? 0} 个，跳过 ${result.data?.skipped ?? 0} 个，失败 ${result.data?.failed ?? 0} 个。`,
        );
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "同步全部基准失败。");
      }
    });
  }

  function moveBenchmark(fromId: string, toId: string) {
    if (fromId === toId) {
      return benchmarkList;
    }

    const fromIndex = benchmarkList.findIndex((benchmark) => benchmark.id === fromId);
    const toIndex = benchmarkList.findIndex((benchmark) => benchmark.id === toId);
    if (fromIndex === -1 || toIndex === -1) {
      return benchmarkList;
    }

    const nextBenchmarks = [...benchmarkList];
    const [movedBenchmark] = nextBenchmarks.splice(fromIndex, 1);
    if (!movedBenchmark) {
      return benchmarkList;
    }

    nextBenchmarks.splice(toIndex, 0, movedBenchmark);
    return nextBenchmarks;
  }

  function persistBenchmarkOrder(nextBenchmarks: BenchmarkListItem[]) {
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/benchmarks/order", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            benchmarkIds: nextBenchmarks.map((benchmark) => benchmark.id),
          }),
        });
        const result = (await response.json()) as {
          data?: BenchmarkListItem[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "保存排序失败。");
        }

        if (result.data) {
          setBenchmarkList(result.data);
        }
        setMessage("指数排序已保存。");
        router.refresh();
      } catch (error) {
        setBenchmarkList(initialBenchmarks);
        setMessage(error instanceof Error ? error.message : "保存排序失败。");
      }
    });
  }

  function handleBenchmarkDrop(targetBenchmarkId: string) {
    if (!draggingBenchmarkId || draggingBenchmarkId === targetBenchmarkId) {
      setDraggingBenchmarkId(null);
      return;
    }

    const nextBenchmarks = moveBenchmark(draggingBenchmarkId, targetBenchmarkId);
    setDraggingBenchmarkId(null);
    setBenchmarkList(nextBenchmarks);
    persistBenchmarkOrder(nextBenchmarks);
  }

  function moveBenchmarkByStep(benchmarkId: string, step: number) {
    const currentIndex = benchmarkList.findIndex((benchmark) => benchmark.id === benchmarkId);
    const nextIndex = currentIndex + step;
    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= benchmarkList.length) {
      return;
    }

    const nextBenchmarks = [...benchmarkList];
    const [movedBenchmark] = nextBenchmarks.splice(currentIndex, 1);
    if (!movedBenchmark) {
      return;
    }

    nextBenchmarks.splice(nextIndex, 0, movedBenchmark);
    setBenchmarkList(nextBenchmarks);
    persistBenchmarkOrder(nextBenchmarks);
  }

  function toggleStatus(benchmark: BenchmarkListItem) {
    const nextStatus = benchmark.status === "active" ? "inactive" : "active";
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/benchmarks/${benchmark.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const result = (await response.json()) as {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "更新基准状态失败。");
        }

        await loadBenchmarkList();
        if (nextStatus !== "active") {
          setSelectedIds((current) =>
            current.filter((benchmarkId) => benchmarkId !== benchmark.id),
          );
        }

        setMessage("基准状态已更新。");
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "更新基准状态失败。",
        );
      }
    });
  }

  function startEditingBenchmark(benchmark: BenchmarkListItem) {
    setEditingBenchmarkId(benchmark.id);
    setEditingCode(benchmark.code);
    setEditingMarket(benchmark.market);
    setEditingName(benchmark.name);
    setEditingCurrency(benchmark.currency ?? "");
    setMessage(null);
  }

  function cancelEditingBenchmark() {
    setEditingBenchmarkId(null);
    setEditingCode("");
    setEditingMarket("");
    setEditingName("");
    setEditingCurrency("");
  }

  function saveBenchmark(benchmarkId: string) {
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/benchmarks/${benchmarkId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: editingCode,
            market: editingMarket,
            name: editingName,
            currency: editingCurrency || null,
          }),
        });
        const result = (await response.json()) as {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "更新基准失败。");
        }

        cancelEditingBenchmark();
        await loadBenchmarkList();
        setMessage("基准已更新；若代码或市场发生变化，系统已重新同步历史。");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "更新基准失败。");
      }
    });
  }

  function removeBenchmark(benchmark: BenchmarkListItem) {
    const confirmed = window.confirm(
      `确认删除 ${benchmark.name}（${benchmark.code}.${benchmark.market}）吗？关联历史点位会一并删除，组合默认基准也会自动清空。`,
    );

    if (!confirmed) {
      return;
    }

    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/benchmarks/${benchmark.id}`, {
          method: "DELETE",
        });
        const result = (await response.json()) as {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "删除基准失败。");
        }

        setSelectedIds((current) => current.filter((id) => id !== benchmark.id));
        if (editingBenchmarkId === benchmark.id) {
          cancelEditingBenchmark();
        }
        await loadBenchmarkList();
        setMessage("基准已删除。");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "删除基准失败。");
      }
    });
  }

  function toggleSelectedBenchmark(benchmarkId: string) {
    setSelectedIds((current) => {
      const nextSelectedIds = current.includes(benchmarkId)
        ? current.filter((id) => id !== benchmarkId)
        : [...current, benchmarkId];

      if (nextSelectedIds.length === 0) {
        setComparison({
          series: [],
          comparisonRange: null,
          availableRange: null,
        });
      }

      return nextSelectedIds;
    });
  }

  function applyPreset(nextPreset: ChartRangePreset) {
    try {
      setMessage(null);
      setRangePreset(nextPreset);

      if (nextPreset === "inception") {
        setRequestedRange(null);
        return;
      }

      if (nextPreset === "custom") {
        setCustomFrom(comparison.availableRange?.from ?? "");
        setCustomTo(comparison.availableRange?.to ?? "");
        return;
      }

      setRequestedRange(buildRequestedRange(nextPreset, customFrom, customTo));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "切换时间区间失败。");
    }
  }

  function applyCustomRange() {
    try {
      setMessage(null);
      setRequestedRange(buildRequestedRange("custom", customFrom, customTo));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "切换时间区间失败。");
    }
  }

  const activeBenchmarks = useMemo(
    () => benchmarkList.filter(
      (benchmark) => benchmark.status === "active" && benchmark.pointCount > 0,
    ),
    [benchmarkList],
  );
  const selectedBenchmarks = selectedIds
    .map((id) => activeBenchmarks.find((benchmark) => benchmark.id === id))
    .filter((benchmark): benchmark is BenchmarkListItem => Boolean(benchmark));
  const matchedComparisonBenchmarks = useMemo(
    () => searchLibraryOptions(activeBenchmarks, comparisonQuery, new Set(selectedIds)),
    [activeBenchmarks, comparisonQuery, selectedIds],
  );

  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid min-w-0 gap-5 xl:grid-cols-[0.9fr_1.1fr] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[0.9fr_1.1fr]">
        <ResponsiveDisclosure targetId="benchmark-discovery" title="发现指数" summary="搜索公开指数 · 手工录入">
        <section id="benchmark-discovery" className="min-w-0 scroll-mt-20 rounded-[1.5rem] border border-border bg-card p-6 lg:scroll-mt-6">
          <h2 className="text-2xl font-semibold">搜索公开指数</h2>

          <form onSubmit={handleBenchmarkSearch} className="mt-5 flex gap-2">
            <input
              aria-label="指数代码或名称"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent"
              placeholder="例如：沪深300 / SPX"
              required
            />
            <button type="submit" disabled={isPending} className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-accent-foreground disabled:opacity-50">搜索</button>
          </form>

          {searchResults.length ? <div className="mt-4 grid gap-2 border-y border-border py-3">
            {searchResults.map((candidate) => {
              const alreadyAdded = benchmarkList.some((benchmark) => isSameBenchmark(benchmark, candidate));
              return <article key={candidate.sourceSymbol} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-background px-4 py-3">
                <div className="min-w-0"><p className="truncate font-medium">{candidate.name}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{candidate.code}.{candidate.market} · {candidate.source}</p></div>
                <button type="button" onClick={() => addSearchResult(candidate)} disabled={isPending || alreadyAdded} className="rounded-full border border-accent px-3 py-2 text-xs font-medium text-accent disabled:opacity-45">{alreadyAdded ? "已录入" : "加入并同步"}</button>
              </article>;
            })}
          </div> : null}

          <details className="mt-5 border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium">搜索不到？手工录入</summary>
            <form onSubmit={handleCreateBenchmark} className="mt-4 grid gap-4">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">代码</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="rounded-2xl border border-border bg-background px-4 py-3 outline-none"
                placeholder="000300 或 SPX / ^GSPC"
                required
              />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">市场</span>
              <input
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                className="rounded-2xl border border-border bg-background px-4 py-3 outline-none"
                placeholder="CN / US / HK"
                required
              />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">名称</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-2xl border border-border bg-background px-4 py-3 outline-none"
                placeholder="沪深300"
                required
              />
            </label>

            <p className="text-xs leading-6 text-muted-foreground">
              中国市场基准优先使用官方公开历史，必要时回退到 Eastmoney；其他市场使用 Yahoo 公开历史。
            </p>

            <button
              type="submit"
              disabled={isPending}
              className="rounded-full border border-accent bg-accent px-5 py-3 text-sm font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "提交中..." : "新增并同步"}
            </button>
          </form>
          </details>

          {message ? <div aria-live="polite" className="mt-4 rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 text-muted-foreground">{message}</div> : null}
        </section>
        </ResponsiveDisclosure>

        <ResponsiveDisclosure targetId="benchmark-library" title="已录入基准" summary={`${benchmarkList.length} 个指数`}>
        <section id="benchmark-library" className="min-w-0 scroll-mt-20 rounded-[1.5rem] border border-border bg-card p-6 lg:scroll-mt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">指数库</p>
              <h2 className="mt-2 text-2xl font-semibold">已录入基准</h2>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={triggerSyncAll}
                disabled={isPending || benchmarkList.length === 0}
                className="rounded-full border border-accent bg-accent px-4 py-2 text-xs font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "同步中..." : "同步全部"}
              </button>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                {benchmarkList.length} 个基准
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {benchmarkList.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground">
                还没有任何基准，先录入第一只指数。
              </div>
            ) : null}

            {benchmarkList.map((benchmark, index) => (
              <article
                key={benchmark.id}
                draggable={!isPending}
                onDragStart={() => setDraggingBenchmarkId(benchmark.id)}
                onDragEnd={() => setDraggingBenchmarkId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleBenchmarkDrop(benchmark.id)}
                className={`rounded-[1.25rem] border bg-background p-4 transition ${
                  draggingBenchmarkId === benchmark.id
                    ? "border-accent opacity-60 shadow-[0_12px_30px_rgba(47,93,80,0.12)]"
                    : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div
                      className="mt-1 flex h-9 w-9 cursor-grab items-center justify-center rounded-full border border-border bg-card text-xs text-muted-foreground active:cursor-grabbing"
                      title="拖拽排序"
                      aria-label={`拖拽排序 ${benchmark.name}`}
                    >
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/benchmarks/${benchmark.id}`} className="text-base font-semibold text-foreground underline-offset-4 hover:text-accent hover:underline">{benchmark.name}</Link>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {benchmark.code}.{benchmark.market}
                        </span>
                        {benchmark.dataBasisLabel ? <span className="border border-[var(--warm-highlight)] bg-card px-2 py-0.5 text-[10px] text-[#9a4f2a]">{benchmark.dataBasisLabel}</span> : null}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        状态 {benchmark.status} · 数据点 {benchmark.pointCount} · 最近数据{" "}
                        {benchmark.latestDate ?? "--"}
                      </p>
                      {benchmark.lastSyncError ? (
                        <p className="mt-2 text-xs leading-6 text-[#9a4f2a]">
                          最近同步错误：{benchmark.lastSyncError}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link href={`/benchmarks/${benchmark.id}`} className="rounded-full border border-accent px-3 py-2 text-xs font-medium text-accent">查看详情</Link>
                    <button
                      type="button"
                      onClick={() => moveBenchmarkByStep(benchmark.id, -1)}
                      disabled={isPending || index === 0}
                      className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBenchmarkByStep(benchmark.id, 1)}
                      disabled={isPending || index === benchmarkList.length - 1}
                      className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      下移
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditingBenchmark(benchmark)}
                      disabled={isPending}
                      className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerSync(benchmark.id)}
                      disabled={isPending}
                      className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      同步
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleStatus(benchmark)}
                      disabled={isPending}
                      className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {benchmark.status === "active" ? "停用" : "启用"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBenchmark(benchmark)}
                      disabled={isPending}
                      className="rounded-full border border-[#d8b9a6] px-3 py-2 text-xs text-[#9a4f2a] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      删除
                    </button>
                  </div>
                </div>

                {editingBenchmarkId === benchmark.id ? (
                  <div className="mt-4 grid gap-3 rounded-[1rem] border border-border/80 bg-card p-4">
                    <div className="grid gap-3 md:grid-cols-2 layout-mobile:grid-cols-1 layout-desktop:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm">
                        <span className="text-muted-foreground">代码</span>
                        <input
                          value={editingCode}
                          onChange={(event) => setEditingCode(event.target.value)}
                          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm">
                        <span className="text-muted-foreground">市场</span>
                        <input
                          value={editingMarket}
                          onChange={(event) => setEditingMarket(event.target.value)}
                          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm">
                        <span className="text-muted-foreground">名称</span>
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm">
                        <span className="text-muted-foreground">币种</span>
                        <input
                          value={editingCurrency}
                          onChange={(event) => setEditingCurrency(event.target.value)}
                          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none"
                          placeholder="可留空"
                        />
                      </label>
                    </div>

                    <p className="text-xs leading-6 text-muted-foreground">
                      修改代码或市场后，旧价格点位会清空，并自动按新标识重新同步历史。
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveBenchmark(benchmark.id)}
                        disabled={isPending}
                        className="rounded-full border border-accent bg-accent px-4 py-2 text-xs font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingBenchmark}
                        disabled={isPending}
                        className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
        </ResponsiveDisclosure>
      </div>

      <ResponsiveDisclosure targetId="benchmark-comparison" title="多指数比较" summary="归一化业绩 · 风险指标">
      <section id="benchmark-comparison" className="min-w-0 scroll-mt-20 overflow-hidden rounded-[1.5rem] border border-border bg-card p-6 lg:scroll-mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">多基准比较</p>
            <h2 className="mt-2 text-2xl font-semibold">归一化业绩对比</h2>
          </div>
        </div>

        <div className="relative mt-5 max-w-2xl">
          <label className="grid gap-1 text-xs text-muted-foreground">搜索指数库并加入比较<input aria-label="搜索多指数比较" value={comparisonQuery} onChange={(event) => setComparisonQuery(event.target.value)} placeholder="输入指数名称或代码" autoComplete="off" className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-accent" /></label>
          {comparisonQuery.trim() ? <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-border bg-card shadow-lg">{matchedComparisonBenchmarks.map((benchmark) => <button type="button" key={benchmark.id} onClick={() => { toggleSelectedBenchmark(benchmark.id); setComparisonQuery(""); }} className="grid w-full grid-cols-[1fr_auto] gap-3 border-b border-border px-3 py-3 text-left text-sm last:border-0 hover:bg-background"><span>{benchmark.name}</span><span className="font-mono text-xs text-muted-foreground">{benchmark.code}</span></button>)}{!matchedComparisonBenchmarks.length ? <p className="px-3 py-4 text-sm text-muted-foreground">没有匹配的未选指数。</p> : null}</div> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{selectedBenchmarks.map((benchmark) => <span key={benchmark.id} className="flex items-center gap-2 rounded-full border border-accent bg-background px-3 py-2 text-sm"><span>{benchmark.name} · <span className="font-mono text-xs">{benchmark.code}</span></span><button type="button" aria-label={`移除比较指数 ${benchmark.name}`} onClick={() => toggleSelectedBenchmark(benchmark.id)} className="text-muted-foreground hover:text-foreground">×</button></span>)}{!selectedBenchmarks.length ? <p className="text-sm text-muted-foreground">暂无已选指数。</p> : null}</div>

        {comparison.series.length === 0 ? (
          <div className="mt-6 rounded-[1.25rem] border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground">
            先选择至少一只有数据的已启用基准。
          </div>
        ) : (
          <>
            <div data-testid="benchmark-comparison-chart" className="mt-6 min-w-0 overflow-hidden rounded-[1.25rem] border border-border/70 bg-[linear-gradient(180deg,rgba(47,93,80,0.08),transparent_36%),radial-gradient(circle_at_top_right,rgba(201,131,82,0.16),transparent_36%)] p-3">
              <ThemedEChart
                height={340}
                option={buildComparisonChartOption(comparison, chartSingleColor, chartSeriesColors)}
              />
            </div>
            <div data-testid="benchmark-comparison-range-controls-row" className="mt-1 flex flex-wrap items-start justify-between gap-2">
              <ChartRangeControls
                testId="benchmark-comparison-range-controls"
                preset={rangePreset}
                customFrom={customFrom}
                customTo={customTo}
                disabled={isPending || selectedIds.length === 0}
                onPresetChange={applyPreset}
                onCustomFromChange={setCustomFrom}
                onCustomToChange={setCustomTo}
                onApplyCustom={applyCustomRange}
              />
              {comparison.comparisonRange ? (
                <span className="border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground">
                  {comparison.comparisonRange.from} 至 {comparison.comparisonRange.to}
                </span>
              ) : null}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4 layout-mobile:grid-cols-1 layout-desktop:grid-cols-4">
              {comparison.series.map((series) => (
                <article
                  key={series.benchmarkId}
                  className="rounded-[1.25rem] border border-border bg-background p-4"
                >
                  <p className="text-sm text-muted-foreground">
                    {series.name} · {series.code}{series.dataBasisLabel ? ` · ${series.dataBasisLabel}` : ""}
                  </p>
                  <p className="mt-3 text-lg font-semibold">
                    区间收益{" "}
                    <span className={returnToneClass(series.metrics.rangeReturn)}>
                      {formatPercent(series.metrics.rangeReturn)}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    年化收益{" "}
                    <span className={returnToneClass(series.metrics.annualizedReturn)}>
                      {formatPercent(series.metrics.annualizedReturn)}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    最大回撤{" "}
                    <span className={drawdownToneClass(series.metrics.maxDrawdown)}>
                      {formatPercent(series.metrics.maxDrawdown)}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    波动率 {formatPercent(series.metrics.volatility)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    夏普 {formatNumber(series.metrics.sharpeRatio)}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      </ResponsiveDisclosure>
    </div>
  );
}

"use client";

import type { EChartsOption } from "echarts";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ChartRangeControls } from "@/components/chart-range-controls";
import { ThemedEChart } from "@/components/charts/themed-echart";
import { buildPaddedValueAxisDomain } from "@/lib/chart-axis-domain";
import {
  A_SHARE_MARKET_CYCLE_OPTIONS,
  formatAxisDateLabel,
  formatEdgeAxisDateLabel,
  resolveFixedStartRange,
  resolvePresetRange,
  type ChartDateRange,
  type ChartRangePreset,
} from "@/lib/chart-time-range";
import {
  buildComparisonReturnSeries,
  buildDrawdownSeries,
  buildFundReturnSeries,
  buildManagerChangeMarkers,
  calculateAnnualizedReturn,
  calculateDrawdownRecovery,
  filterFundNavPoints,
  resolveCurrentManagerStartDate,
  type ComparisonReturnSeries,
  type ComparisonSeriesInput,
  type FundManagerTenureInput,
  type FundNavChartPoint,
  type ManagerChangeMarker,
} from "@/lib/funds/chart-range";
import { drawdownToneClass, returnToneClass, visualToneColors } from "@/lib/visual-tones";

const chartPalette = {
  background: "#f4efe6",
  foreground: "#1f2520",
  mutedForeground: "#5e675d",
  border: "#d7c8af",
  managerChange: "#b42318",
  dividend: "#b7791f",
  drawdown: visualToneColors.loss,
};

type BenchmarkOption = {
  id: string;
  name: string;
  code: string;
  market: string;
};

type ComparisonResponse = {
  range: ChartDateRange | null;
  series: ComparisonSeriesInput[];
  warnings: string[];
};

type VisibleManagerMarker = ManagerChangeMarker & { returnRate: number };

const StableFundChart = memo(function StableFundChart({ option, onClick }: {
  option: EChartsOption;
  revision: string;
  onClick: (parameters: unknown) => void;
}) {
  return <ThemedEChart option={option} height={350} onEvents={{ click: onClick }} />;
}, (previous, next) => previous.revision === next.revision);

function formatReturn(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function basisLabel(basis: ComparisonReturnSeries["basis"]) {
  if (basis === "dividend_reinvested") return "分红再投资复权";
  if (basis === "accumulated_nav") return "累计净值";
  if (basis === "unit_nav") return "单位净值";
  return "指数点位";
}

export function FundNavChart({
  fundId,
  points,
  managerTenures,
  benchmarks,
  chartSingleColor = visualToneColors.chartSingle,
  chartSeriesColors = [...visualToneColors.chartBenchmark],
}: {
  fundId: string;
  points: FundNavChartPoint[];
  managerTenures: FundManagerTenureInput[];
  benchmarks: BenchmarkOption[];
  chartSingleColor?: string;
  chartSeriesColors?: string[];
}) {
  const orderedPoints = useMemo(
    () => [...points].sort((left, right) => left.date.localeCompare(right.date)),
    [points],
  );
  const availableRange = orderedPoints.length
    ? { from: orderedPoints[0]!.date, to: orderedPoints.at(-1)!.date }
    : null;
  const [preset, setPreset] = useState<ChartRangePreset>("inception");
  const [customFrom, setCustomFrom] = useState(availableRange?.from ?? "");
  const [customTo, setCustomTo] = useState(availableRange?.to ?? "");
  const [requestedRange, setRequestedRange] = useState<ChartDateRange | null>(null);
  const [selectedMarketCycleId, setSelectedMarketCycleId] = useState<string | null>(null);
  const [isCurrentManagerRangeSelected, setIsCurrentManagerRangeSelected] = useState(false);
  const [rangeMessage, setRangeMessage] = useState<string | null>(null);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState("");
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [comparisonMessage, setComparisonMessage] = useState<string | null>(null);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [isBenchmarkMenuOpen, setIsBenchmarkMenuOpen] = useState(false);
  const [selectedManagerMarkerDate, setSelectedManagerMarkerDate] = useState<string | null>(null);
  const [selectedDividendMarkerDate, setSelectedDividendMarkerDate] = useState<string | null>(null);
  const [highlightedSeriesName, setHighlightedSeriesName] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"performance" | "drawdown">("performance");
  const [showManagerMarkers, setShowManagerMarkers] = useState(true);
  const [showDividendMarkers, setShowDividendMarkers] = useState(false);
  const benchmarkMenuRef = useRef<HTMLDivElement>(null);
  const managerCardRef = useRef<HTMLElement>(null);
  const currentManagerStartDate = useMemo(
    () => resolveCurrentManagerStartDate(managerTenures),
    [managerTenures],
  );

  const visiblePoints = useMemo(
    () => filterFundNavPoints(orderedPoints, requestedRange),
    [orderedPoints, requestedRange],
  );
  const fundReturnSeries = useMemo(() => buildFundReturnSeries(visiblePoints), [visiblePoints]);
  const comparisonSeries = useMemo(
    () => buildComparisonReturnSeries(comparison?.series ?? []),
    [comparison],
  );
  const selectedBenchmark = benchmarks.find((item) => item.id === selectedBenchmarkId);
  const hasComparison = comparisonSeries.some((item) => item.kind === "fund")
    && comparisonSeries.some((item) => item.kind === "benchmark");
  const displayedSeries = hasComparison ? comparisonSeries : [
    {
      id: fundId,
      kind: "fund" as const,
      name: "基金净值",
      code: "",
      basis: fundReturnSeries.basis,
      points: fundReturnSeries.points.map((point) => ({
        date: point.date,
        value: point.value,
        returnRate: point.returnRate,
      })),
    },
  ];
  const fundSeries = displayedSeries.find((item) => item.kind === "fund");
  const benchmarkSeries = displayedSeries.find((item) => item.kind === "benchmark");
  const fundLatestReturn = fundSeries?.points.at(-1)?.returnRate;
  const benchmarkLatestReturn = benchmarkSeries?.points.at(-1)?.returnRate;
  const fundAnnualizedReturn = calculateAnnualizedReturn(fundSeries?.points ?? []);
  const benchmarkAnnualizedReturn = calculateAnnualizedReturn(benchmarkSeries?.points ?? []);
  const drawdownRecovery = calculateDrawdownRecovery(fundSeries?.points ?? []);
  const drawdownSeries = displayedSeries.map((series) => ({
    ...series,
    points: buildDrawdownSeries(series.points),
  }));
  const excessReturn = fundLatestReturn !== undefined && benchmarkLatestReturn !== undefined
    ? fundLatestReturn - benchmarkLatestReturn
    : null;
  const chartDates = displayedSeries[0]?.points.map((point) => point.date) ?? [];
  const visibleRange = hasComparison
    ? comparison?.range ?? null
    : chartDates.length
      ? { from: chartDates[0]!, to: chartDates.at(-1)! }
      : null;
  const managerChangeMarkers = useMemo(
    () => buildManagerChangeMarkers(managerTenures, fundReturnSeries.points),
    [fundReturnSeries.points, managerTenures],
  );
  const visibleManagerMarkers: VisibleManagerMarker[] = managerChangeMarkers.flatMap((marker) => {
    if (hasComparison && comparison?.range
      && (marker.valuationDate < comparison.range.from || marker.valuationDate > comparison.range.to)) {
      return [];
    }
    const point = fundSeries?.points.find((item) => item.date === marker.valuationDate);
    return point ? [{ ...marker, returnRate: point.returnRate }] : [];
  });
  const selectedManagerMarker = visibleManagerMarkers.find(
    (marker) => marker.valuationDate === selectedManagerMarkerDate,
  );
  const visibleDividendMarkers = fundReturnSeries.points.flatMap((point) => {
    if (!point.dividendAmount || point.dividendAmount <= 0) return [];
    if (hasComparison && comparison?.range
      && (point.date < comparison.range.from || point.date > comparison.range.to)) return [];
    const displayedPoint = fundSeries?.points.find((item) => item.date === point.date);
    return displayedPoint ? [{ date: point.date, amount: point.dividendAmount, unitNav: point.unitNav, returnRate: displayedPoint.returnRate }] : [];
  });
  const selectedDividendMarker = visibleDividendMarkers.find((marker) => marker.date === selectedDividendMarkerDate);
  const seriesColor = (index: number) => displayedSeries.length === 1
    ? chartSingleColor
    : chartSeriesColors[index % chartSeriesColors.length] ?? visualToneColors.chartBenchmark[index % visualToneColors.chartBenchmark.length]!;

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      if (!benchmarkMenuRef.current?.contains(event.target as Node)) {
        setIsBenchmarkMenuOpen(false);
      }
      if (!managerCardRef.current?.contains(event.target as Node)) {
        setSelectedManagerMarkerDate(null);
        setSelectedDividendMarkerDate(null);
      }
    }

    function closeMenuWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsBenchmarkMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenuWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenuWithEscape);
    };
  }, []);

  useEffect(() => {
    if (!selectedBenchmarkId) return;

    const controller = new AbortController();
    const parameters = new URLSearchParams({
      fundIds: fundId,
      benchmarkId: selectedBenchmarkId,
    });
    if (requestedRange) {
      parameters.set("from", requestedRange.from);
      parameters.set("to", requestedRange.to);
    }

    fetch(`/api/research/compare?${parameters.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as ComparisonResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "指数对比加载失败。");
        setComparison(body);
        setComparisonMessage(body.warnings.length ? body.warnings.join(" ") : null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setComparison(null);
        setComparisonMessage(error instanceof Error ? error.message : "指数对比加载失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingComparison(false);
      });

    return () => controller.abort();
  }, [fundId, requestedRange, selectedBenchmarkId]);

  function applyPreset(nextPreset: ChartRangePreset) {
    setRangeMessage(null);
    setPreset(nextPreset);
    setSelectedMarketCycleId(null);
    setIsCurrentManagerRangeSelected(false);
    setSelectedManagerMarkerDate(null);
    if (selectedBenchmarkId && (nextPreset !== preset || selectedMarketCycleId)) {
      setComparison(null);
      setComparisonMessage(null);
      setIsLoadingComparison(true);
    }
    if (!availableRange || nextPreset === "inception") {
      setRequestedRange(null);
      return;
    }
    if (nextPreset === "custom") {
      setCustomFrom(availableRange.from);
      setCustomTo(availableRange.to);
      return;
    }
    setRequestedRange(resolvePresetRange(nextPreset, availableRange));
  }

  function applyCustomRange() {
    setRangeMessage(null);
    if (!customFrom || !customTo) {
      setRangeMessage("请完整填写自定义时间区间。");
      return;
    }
    if (customFrom > customTo) {
      setRangeMessage("自定义起始日期不能晚于结束日期。");
      return;
    }
    if (selectedBenchmarkId) {
      setComparison(null);
      setComparisonMessage(null);
      setIsLoadingComparison(true);
    }
    setSelectedManagerMarkerDate(null);
    setRequestedRange({ from: customFrom, to: customTo });
  }

  function applyMarketCycle(cycleId: string) {
    if (!availableRange) return;
    const cycle = A_SHARE_MARKET_CYCLE_OPTIONS.find((item) => item.id === cycleId);
    if (!cycle) return;
    const resolved = resolveFixedStartRange(cycle.from, availableRange);
    setPreset("3y");
    setSelectedMarketCycleId(cycleId);
    setIsCurrentManagerRangeSelected(false);
    setSelectedManagerMarkerDate(null);
    setRangeMessage(resolved.clampedToAvailableStart
      ? `${cycle.label}起点早于基金净值历史，已从基金首个净值日开始。`
      : null);
    if (selectedBenchmarkId) {
      setComparison(null);
      setComparisonMessage(null);
      setIsLoadingComparison(true);
    }
    setRequestedRange(resolved.range);
  }

  function applyCurrentManagerRange() {
    if (!availableRange || !currentManagerStartDate) return;
    const resolved = resolveFixedStartRange(currentManagerStartDate, availableRange);
    setPreset("3y");
    setSelectedMarketCycleId(null);
    setIsCurrentManagerRangeSelected(true);
    setSelectedManagerMarkerDate(null);
    setRangeMessage(resolved.clampedToAvailableStart
      ? "现任经理任职日早于基金净值历史，已从基金首个净值日开始。"
      : null);
    if (selectedBenchmarkId) {
      setComparison(null);
      setComparisonMessage(null);
      setIsLoadingComparison(true);
    }
    setRequestedRange(resolved.range);
  }

  function selectBenchmark(benchmarkId: string) {
    setComparison(null);
    setComparisonMessage(null);
    setIsLoadingComparison(Boolean(benchmarkId));
    setSelectedBenchmarkId(benchmarkId);
    setSelectedManagerMarkerDate(null);
    setIsBenchmarkMenuOpen(false);
  }

  function handleBenchmarkMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const focusMenuItem = () => {
      const menuItems = Array.from(
        benchmarkMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      );
      if (!menuItems.length) return;
      const activeIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = activeIndex === -1
        ? event.key === "ArrowDown" ? 0 : menuItems.length - 1
        : (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + menuItems.length) % menuItems.length;
      menuItems[nextIndex]?.focus();
    };

    if (!isBenchmarkMenuOpen) {
      setIsBenchmarkMenuOpen(true);
      requestAnimationFrame(focusMenuItem);
      return;
    }
    focusMenuItem();
  }

  function handleChartClick(parameters: unknown) {
    if (!parameters || typeof parameters !== "object") return;
    const event = parameters as { seriesName?: unknown; data?: unknown };
    if (!Array.isArray(event.data)) return;
    const valuationDate = event.data[0];
    if (typeof valuationDate !== "string") return;
    if (event.seriesName === "基金经理更换") {
      setSelectedDividendMarkerDate(null);
      setSelectedManagerMarkerDate(valuationDate);
    }
    if (event.seriesName === "基金分红") {
      setSelectedManagerMarkerDate(null);
      setSelectedDividendMarkerDate(valuationDate);
    }
  }

  const plottedSeries = chartView === "performance" ? displayedSeries : drawdownSeries;
  const axisDomain = buildPaddedValueAxisDomain(
    plottedSeries.flatMap((series) => series.points.map((point) => (
      "drawdown" in point ? point.drawdown * 100 : point.returnRate * 100
    ))),
    { includeZero: true, minSpan: 4 },
  );
  const option: EChartsOption = {
    animationDuration: 650,
    grid: { left: 16, right: hasComparison ? 112 : 76, top: 46, bottom: 30, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", snap: true },
      backgroundColor: chartPalette.background,
      borderColor: chartPalette.border,
      textStyle: { color: chartPalette.foreground },
      formatter: (parameters) => {
        const entries = Array.isArray(parameters) ? parameters : [parameters];
        const first = entries[0] as (typeof entries)[number] & { axisValue?: unknown };
        const date = typeof first?.axisValue === "string" ? first.axisValue : "";
        const lines = [`<div style="margin-bottom:4px;font-weight:600">${escapeHtml(date)}</div>`];
        for (const entry of entries) {
          const data = Array.isArray(entry.data) ? entry.data : [];
          if (entry.seriesName === "最大回撤区段") continue;
          if (entry.seriesName === "基金经理更换") {
            const marker = visibleManagerMarkers.find((item) => item.valuationDate === data[0]);
            if (marker) {
              for (const change of marker.changes) {
                lines.push(`<div><span style="display:inline-block;margin-right:6px;border-radius:50%;width:8px;height:8px;background:${chartPalette.managerChange}"></span>经理更换 ${escapeHtml(change.date)} · 新任 ${change.managerNames.map(escapeHtml).join("、")}</div>`);
              }
            }
            continue;
          }
          if (entry.seriesName === "基金分红") {
            const dividend = visibleDividendMarkers.find((item) => item.date === data[0]);
            if (dividend) lines.push(`<div><span style="display:inline-block;margin-right:6px;width:8px;height:8px;transform:rotate(45deg);background:${chartPalette.dividend}"></span>基金分红 · 每份 ${dividend.amount.toFixed(5)} 元 · 除息净值 ${dividend.unitNav.toFixed(4)}</div>`);
            continue;
          }
          const percent = typeof data[1] === "number" ? data[1] : null;
          const rawValue = typeof data[2] === "number" ? data[2] : null;
          const currentSeries = displayedSeries.find((series) => series.name === entry.seriesName);
          const marker = typeof entry.marker === "string" ? entry.marker : "";
          const tone = percent === null || percent === 0 ? visualToneColors.neutral : percent > 0 ? visualToneColors.gain : visualToneColors.loss;
          const metricLabel = chartView === "performance" ? "相对起点" : "当前回撤";
          lines.push(`<div>${marker}${escapeHtml(String(entry.seriesName ?? ""))} ${metricLabel} <strong style="color:${tone}">${percent === null ? "--" : `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`}</strong>${rawValue === null || !currentSeries ? "" : ` · ${basisLabel(currentSeries.basis)} ${rawValue.toFixed(currentSeries.kind === "fund" ? 4 : 2)}`}</div>`);
        }
        return lines.join("");
      },
    },
    legend: {
      show: false,
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
        interval: (index: number) => index === 0
          || index === chartDates.length - 1
          || index % Math.max(Math.ceil(chartDates.length / 10), 1) === 0,
        formatter: (value: string, index: number) => index === 0 || index === chartDates.length - 1
          ? formatEdgeAxisDateLabel(value)
          : formatAxisDateLabel(value, index, chartDates),
      },
      axisLine: { lineStyle: { color: chartPalette.border } },
    },
    yAxis: {
      type: "value",
      min: axisDomain.min,
      max: axisDomain.max,
      axisLabel: { color: chartPalette.mutedForeground, formatter: (value: number) => `${value.toFixed(0)}%` },
      splitLine: { lineStyle: { color: chartPalette.border, opacity: 0.45 } },
    },
    series: [
      ...plottedSeries.map((series, seriesIndex) => {
      const isBenchmark = series.kind === "benchmark";
      const color = seriesColor(seriesIndex);
      const latestPoint = series.points.at(-1);
      return {
        name: series.name,
        type: "line" as const,
        showSymbol: true,
        smooth: 0.14,
        symbol: "circle",
        symbolSize: (value: unknown) => Array.isArray(value) && value[0] === latestPoint?.date ? 10 : 0,
        lineStyle: { width: highlightedSeriesName === series.name ? 5 : isBenchmark ? 2.5 : 3, type: "solid" as const, color },
        itemStyle: { color, borderColor: chartPalette.background, borderWidth: 2 },
        areaStyle: !hasComparison && !isBenchmark ? { color, opacity: chartView === "drawdown" ? 0.12 : 0.08 } : undefined,
        endLabel: { show: true, color, formatter: isBenchmark ? "指数" : "基金" },
        labelLayout: { moveOverlap: "shiftY" as const },
        markLine: !isBenchmark ? { silent: true, symbol: "none", lineStyle: { color: chartPalette.border }, data: [{ yAxis: 0 }] } : undefined,
        data: series.points.map((point) => [point.date, ("drawdown" in point ? point.drawdown : point.returnRate) * 100, point.value]),
      };
      }),
      ...(chartView === "performance" && drawdownRecovery?.peakDate && drawdownRecovery.troughDate && fundSeries ? [{
        name: "最大回撤区段",
        type: "line" as const,
        silent: true,
        connectNulls: false,
        showSymbol: true,
        symbolSize: 7,
        z: 12,
        lineStyle: { width: 5, color: chartPalette.drawdown },
        itemStyle: { color: chartPalette.drawdown },
        tooltip: { show: false },
        data: fundSeries.points.map((point) => point.date >= drawdownRecovery.peakDate! && point.date <= drawdownRecovery.troughDate!
          ? [point.date, point.returnRate * 100, point.value]
          : [point.date, null, point.value]),
      }] : []),
      ...(chartView === "performance" && showManagerMarkers && visibleManagerMarkers.length ? [{
        name: "基金经理更换",
        type: "scatter" as const,
        symbol: "circle",
        symbolSize: 18,
        z: 20,
        itemStyle: {
          color: chartPalette.managerChange,
          borderColor: chartPalette.background,
          borderWidth: 2,
        },
        emphasis: { scale: 1.35 },
        data: visibleManagerMarkers.map((marker) => [
          marker.valuationDate,
          marker.returnRate * 100,
        ]),
      }] : []),
      ...(chartView === "performance" && showDividendMarkers && visibleDividendMarkers.length ? [{
        name: "基金分红",
        type: "scatter" as const,
        symbol: "diamond",
        symbolSize: 17,
        z: 21,
        itemStyle: { color: chartPalette.dividend, borderColor: chartPalette.background, borderWidth: 2 },
        emphasis: { scale: 1.35 },
        data: visibleDividendMarkers.map((marker) => [marker.date, marker.returnRate * 100]),
      }] : []),
    ],
  };
  const chartRevision = [
    visibleRange?.from,
    visibleRange?.to,
    ...displayedSeries.map((series) => `${series.id}:${series.points.length}:${series.points.at(-1)?.value ?? ""}`),
    ...visibleManagerMarkers.map((marker) => `m:${marker.valuationDate}`),
    ...visibleDividendMarkers.map((marker) => `d:${marker.date}:${marker.amount}`),
    `highlight:${highlightedSeriesName ?? ""}`,
    `view:${chartView}`,
    `manager:${showManagerMarkers}`,
    `dividend:${showDividendMarkers}`,
    `colors:${chartSingleColor}:${chartSeriesColors.join(",")}`,
  ].join("|");

  return (
    <div>
      <div className="grid gap-3 border-b border-border pb-4 xl:grid-cols-[minmax(18rem,1fr)_auto] xl:items-end">
        <div>
          <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
            {visibleRange
              ? `${visibleRange.from} 至 ${visibleRange.to} · ${chartDates.length} 个观测点`
              : "所选区间暂无可比较数据"}
          </p>
          {fundSeries?.points.length && chartDates.length >= 2 ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm" aria-live="polite">
              <p className="text-xs text-muted-foreground">{visibleRange?.to} 相对起点</p>
              <p><span className="text-muted-foreground">基金收益 </span><strong className={returnToneClass(fundLatestReturn ?? 0)}>{formatReturn(fundLatestReturn)}</strong></p>
              <p><span className="text-muted-foreground">基金年化 </span><strong className={returnToneClass(fundAnnualizedReturn ?? 0)}>{formatReturn(fundAnnualizedReturn)}</strong></p>
              {benchmarkSeries ? <p><span className="text-muted-foreground">指数收益 </span><strong className={returnToneClass(benchmarkLatestReturn ?? 0)}>{formatReturn(benchmarkLatestReturn)}</strong></p> : null}
              {benchmarkSeries ? <p><span className="text-muted-foreground">指数年化 </span><strong className={returnToneClass(benchmarkAnnualizedReturn ?? 0)}>{formatReturn(benchmarkAnnualizedReturn)}</strong></p> : null}
              {benchmarkSeries ? <p><span className="text-muted-foreground">超额收益 </span><strong className={returnToneClass(excessReturn ?? 0)}>{formatReturn(excessReturn)}</strong></p> : null}
              <p className="text-xs text-muted-foreground">{basisLabel(fundSeries.basis)} · 截至 {visibleRange?.to}</p>
              {drawdownRecovery ? (
                <div data-testid="drawdown-recovery" className="w-full border-l-2 border-[#8f6d58] pl-3 text-xs leading-5 text-muted-foreground">
                  {drawdownRecovery.peakDate && drawdownRecovery.troughDate ? (
                    <>
                      <p>最大回撤 <strong className={drawdownToneClass(drawdownRecovery.maxDrawdown)}>{formatReturn(drawdownRecovery.maxDrawdown)}</strong> · {drawdownRecovery.peakDate} → {drawdownRecovery.troughDate} · 下跌 {drawdownRecovery.declineDays} 天 · {drawdownRecovery.recoveryDate ? `${drawdownRecovery.recoveryDate} 修复` : "尚未修复"}</p>
                    </>
                  ) : <p>最大回撤 0.00% · 区间内无回撤修复过程</p>}
                </div>
              ) : <p className="w-full text-xs text-muted-foreground">最大回撤 -- · 区间数据不足</p>}
            </div>
          ) : fundSeries?.points.length ? <p className="mt-2 text-xs text-muted-foreground">区间内不足两个有效点，暂不计算收益率。</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
          <ChartRangeControls
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            disabled={!availableRange}
            marketCycleOptions={A_SHARE_MARKET_CYCLE_OPTIONS}
            selectedMarketCycleId={selectedMarketCycleId}
            currentManagerStartDate={currentManagerStartDate}
            isCurrentManagerRangeSelected={isCurrentManagerRangeSelected}
            onPresetChange={applyPreset}
            onMarketCycleChange={applyMarketCycle}
            onCurrentManagerRangeChange={applyCurrentManagerRange}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            onApplyCustom={applyCustomRange}
          />
          <div ref={benchmarkMenuRef} onKeyDown={handleBenchmarkMenuKeyDown} className="relative">
            <button
              type="button"
              aria-expanded={isBenchmarkMenuOpen}
              aria-haspopup="menu"
              onClick={() => setIsBenchmarkMenuOpen((open) => !open)}
              disabled={!benchmarks.length}
              className="min-w-32 border border-[var(--warm-highlight)] bg-background px-3 py-1.5 text-left text-xs font-medium text-foreground disabled:border-border disabled:text-muted-foreground"
            >
              {isLoadingComparison ? "加载指数…" : selectedBenchmark ? `对比：${selectedBenchmark.name}` : "对比指数"}
              <span className="ml-2 text-muted-foreground" aria-hidden="true">⌄</span>
            </button>
            {isBenchmarkMenuOpen ? (
              <div role="menu" aria-label="选择对比指数" className="absolute right-0 z-20 mt-2 max-h-72 w-72 overflow-y-auto border border-border bg-card p-1 shadow-xl">
                <button type="button" role="menuitem" onClick={() => selectBenchmark("")} className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted">无指数对比</button>
                {benchmarks.map((benchmark) => (
                  <button key={benchmark.id} type="button" role="menuitem" aria-label={`${benchmark.name} · ${benchmark.code}`} onClick={() => selectBenchmark(benchmark.id)} className={selectedBenchmarkId === benchmark.id ? "w-full bg-muted px-3 py-2 text-left" : "w-full px-3 py-2 text-left hover:bg-muted focus:bg-muted"}>
                    <span className="block text-sm font-medium">{benchmark.name}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{benchmark.code} · {benchmark.market}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {rangeMessage || comparisonMessage ? (
        <p className="mt-3 border-l-2 border-[var(--warm-highlight)] pl-3 text-sm text-red-700" aria-live="polite">
          {rangeMessage ?? comparisonMessage}
        </p>
      ) : null}

      {displayedSeries[0]?.points.length ? (
        <div className="relative">
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="图表视图" className="flex gap-px bg-border p-px">
              {(["performance", "drawdown"] as const).map((view) => <button key={view} type="button" aria-pressed={chartView === view} onClick={() => { setChartView(view); setSelectedManagerMarkerDate(null); setSelectedDividendMarkerDate(null); }} className={chartView === view ? "bg-foreground px-3 py-1.5 text-xs text-background" : "bg-background px-3 py-1.5 text-xs text-muted-foreground"}>{view === "performance" ? "业绩曲线" : "回撤曲线"}</button>)}
            </div>
            <div aria-label="曲线标签" className="flex flex-wrap gap-2">
            {displayedSeries.map((series, seriesIndex) => {
              const color = seriesColor(seriesIndex);
              const highlighted = highlightedSeriesName === series.name;
              return <button key={series.id} type="button" aria-pressed={highlighted} onClick={() => setHighlightedSeriesName((current) => current === series.name ? null : series.name)} className={highlighted ? "border border-foreground bg-background px-3 py-1.5 text-xs font-bold" : "border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground"}><span className="mr-2 inline-block h-0.5 w-5 align-middle" style={{ backgroundColor: color }} />{series.name}</button>;
            })}
            {visibleManagerMarkers.length ? <button data-testid="manager-change-legend" type="button" aria-pressed={showManagerMarkers} onClick={() => { setShowManagerMarkers((current) => !current); setSelectedManagerMarkerDate(null); }} className={showManagerMarkers ? "border border-[#b42318] bg-background px-3 py-1.5 text-xs font-medium" : "border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground opacity-60"}><span className="mr-2 inline-block size-2.5 rounded-full bg-[#b42318] align-middle" />经理更换</button> : null}
            {visibleDividendMarkers.length ? <button data-testid="dividend-legend" type="button" aria-pressed={showDividendMarkers} onClick={() => { setShowDividendMarkers((current) => !current); setSelectedDividendMarkerDate(null); }} className={showDividendMarkers ? "border border-[#b7791f] bg-background px-3 py-1.5 text-xs font-medium" : "border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground opacity-60"}><span className="mr-2 inline-block size-2.5 rotate-45 bg-[#b7791f] align-middle" />基金分红</button> : null}
            {chartView === "performance" && drawdownRecovery?.peakDate ? <span data-testid="max-drawdown-segment-legend" className="border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"><span className="mr-2 inline-block h-1 w-5 bg-[#27845f] align-middle" />绿色：最大回撤段</span> : null}
            </div>
          </div>
          <StableFundChart option={option} revision={chartRevision} onClick={handleChartClick} />
          {selectedManagerMarker ? (
            <aside ref={managerCardRef} data-testid="manager-change-card" className="absolute right-3 top-14 z-20 w-[min(20rem,calc(100%-1.5rem))] border border-[#b42318]/40 bg-card/98 p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b42318]">Manager Change</p><h3 className="mt-1 text-base font-semibold">基金经理更换</h3></div>
                <button type="button" aria-label="关闭经理更换详情" onClick={() => setSelectedManagerMarkerDate(null)} className="px-1 text-lg leading-none text-muted-foreground">×</button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">对应净值日 {selectedManagerMarker.valuationDate} · 相对区间起点 {formatReturn(selectedManagerMarker.returnRate)}</p>
              <div className="mt-3 grid gap-2">
                {selectedManagerMarker.changes.map((change) => <p key={change.date} className="text-sm"><span className="font-mono text-xs text-muted-foreground">{change.date}</span><span className="ml-2">新任 {change.managerNames.join("、")}</span></p>)}
              </div>
            </aside>
          ) : null}
          {selectedDividendMarker ? (
            <aside ref={managerCardRef} data-testid="dividend-card" className="absolute right-3 top-14 z-20 w-[min(20rem,calc(100%-1.5rem))] border border-[#b7791f]/50 bg-card/98 p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a5b16]">Dividend Reinvested</p><h3 className="mt-1 text-base font-semibold">基金分红</h3></div>
                <button type="button" aria-label="关闭基金分红详情" onClick={() => setSelectedDividendMarkerDate(null)} className="px-1 text-lg leading-none text-muted-foreground">×</button>
              </div>
              <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">除息日期</dt><dd className="font-mono">{selectedDividendMarker.date}</dd>
                <dt className="text-muted-foreground">每份分红</dt><dd>{selectedDividendMarker.amount.toFixed(5)} 元</dd>
                <dt className="text-muted-foreground">当日净值</dt><dd>{selectedDividendMarker.unitNav.toFixed(4)}</dd>
              </dl>
              <p className="mt-3 border-l-2 border-[#b7791f] pl-3 text-xs leading-6 text-muted-foreground">业绩按除息日净值将现金分红转换为新增份额，计入分红再投资后的总回报。</p>
            </aside>
          ) : null}
        </div>
      ) : (
        <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
          该时间区间内没有可展示的净值记录。
        </div>
      )}
    </div>
  );
}

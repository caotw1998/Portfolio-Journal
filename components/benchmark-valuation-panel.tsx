"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption, MarkAreaComponentOption } from "echarts";
import { ThemedEChart } from "@/components/charts/themed-echart";
import {
  calculateBenchmarkPerformance,
  calculateRiskFreeComparison,
  calculateValuationSummary,
  formatValuationAxisTick,
  type BenchmarkValuationBand,
  type BenchmarkValuationMetric,
  type BenchmarkValuationPoint,
  type BenchmarkValuationRange,
  type RiskFreeComparisonMode,
} from "@/lib/domain/benchmark-valuations";

type PanelMetric = BenchmarkValuationMetric | "riskFreeComparison";
type AuxiliaryVisibility = Record<PanelMetric, { performance: boolean; riskFreeRate: boolean }>;

const METRICS: Array<{ key: BenchmarkValuationMetric; label: string }> = [
  { key: "pe", label: "市盈率（PE）" },
  { key: "pb", label: "市净率（PB）" },
  { key: "dividendYield", label: "股息率" },
];
const RANGES: Array<{ key: BenchmarkValuationRange; label: string }> = [
  { key: "3y", label: "近3年" },
  { key: "5y", label: "近5年" },
  { key: "10y", label: "近10年" },
  { key: "all", label: "全部" },
];
const BANDS: BenchmarkValuationBand[] = ["极低估", "较低估", "适中", "较高估", "极高估"];
const BAND_STYLES: Record<BenchmarkValuationBand, { text: string; background: string; line: string }> = {
  极低估: { text: "text-[#287a5c]", background: "bg-[#dff1e8]", line: "#3cab82" },
  较低估: { text: "text-[#277a80]", background: "bg-[#dff1f0]", line: "#48aeb2" },
  适中: { text: "text-[#336f99]", background: "bg-[#e3edf5]", line: "#5a94bd" },
  较高估: { text: "text-[#a45a12]", background: "bg-[#f8ead8]", line: "#d38a38" },
  极高估: { text: "text-[#a43b35]", background: "bg-[#f6dfdc]", line: "#d95c54" },
};
const INDEX_PERFORMANCE_SERIES = "指数业绩";
const RISK_FREE_RATE_SERIES = "10年期无风险利率";
const INITIAL_AUXILIARY_VISIBILITY: AuxiliaryVisibility = {
  pe: { performance: false, riskFreeRate: false },
  pb: { performance: false, riskFreeRate: false },
  dividendYield: { performance: false, riskFreeRate: false },
  riskFreeComparison: { performance: false, riskFreeRate: false },
};

function ValuationRangeMenu({ range, onChange }: { range: BenchmarkValuationRange; onChange: (range: BenchmarkValuationRange) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeLabel = RANGES.find((item) => item.key === range)?.label ?? "近3年";

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button ref={triggerRef} type="button" aria-label={`估值时间区间：${activeLabel}`} aria-expanded={isOpen} aria-haspopup="menu" onClick={() => setIsOpen((open) => !open)} className="flex h-8 items-center border border-foreground bg-foreground px-2.5 text-[11px] font-medium text-background">
        {activeLabel}<span className="ml-1.5" aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div role="menu" aria-label="选择估值时间区间" className="absolute bottom-full left-0 z-40 mb-2 w-36 border border-border bg-card p-1 shadow-xl">
          {RANGES.map((item) => <button key={item.key} type="button" role="menuitem" aria-current={range === item.key ? "true" : undefined} onClick={() => { onChange(item.key); setIsOpen(false); }} className={range === item.key ? "min-h-10 w-full bg-muted px-3 py-2 text-left text-sm font-medium" : "min-h-10 w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted"}>{item.label}</button>)}
        </div>
      ) : null}
    </div>
  );
}

function metricValue(point: BenchmarkValuationPoint, metric: BenchmarkValuationMetric) {
  return metric === "pe" ? point.peTtm : metric === "pb" ? point.pb : point.dividendYield;
}

function formatValue(value: number | null, metric: BenchmarkValuationMetric) {
  if (value === null) return "--";
  return `${value.toFixed(2)}${metric === "dividendYield" ? "%" : ""}`;
}

function formatComparisonValue(value: number | null, mode: RiskFreeComparisonMode) {
  if (value === null) return "--";
  return `${value.toFixed(2)}${mode === "difference" ? " 个百分点" : " 倍"}`;
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPointValue(value: number, metric: PanelMetric, comparisonMode: RiskFreeComparisonMode) {
  if (metric === "riskFreeComparison") return formatComparisonValue(value, comparisonMode);
  return formatValue(value, metric);
}

function tooltipMarker(color: string) {
  return `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:10px;height:10px;background-color:${color}"></span>`;
}

function tooltipFormatter(
  params: unknown,
  primarySeriesName: string,
  metric: PanelMetric,
  comparisonMode: RiskFreeComparisonMode,
  auxiliary: {
    riskFreeRateVisible: boolean;
    performanceVisible: boolean;
    riskFreeRateByDate: ReadonlyMap<string, number>;
    performanceByDate: ReadonlyMap<string, number>;
  },
) {
  const entries = (Array.isArray(params) ? params : [params]) as Array<{
    axisValue?: unknown;
    marker?: unknown;
    seriesName?: unknown;
    value?: unknown;
  }>;
  const primaryEntry = entries.find((entry) => entry.seriesName === primarySeriesName) ?? entries[0];
  const primaryValues = Array.isArray(primaryEntry?.value) ? primaryEntry.value : [];
  const date = typeof primaryValues[0] === "string"
    ? primaryValues[0]
    : typeof primaryEntry?.axisValue === "string" ? primaryEntry.axisValue : "";
  const lines = [`<div style="margin-bottom:6px;font-weight:600">${date}</div>`];
  const primaryValue = typeof primaryValues[1] === "number" ? primaryValues[1] : null;
  if (primaryValue !== null) {
    const marker = typeof primaryEntry?.marker === "string" ? primaryEntry.marker : tooltipMarker("#276c9b");
    lines.push(`<div>${marker}${primarySeriesName} ${formatPointValue(primaryValue, metric, comparisonMode)}</div>`);
    const percentile = typeof primaryValues[2] === "number" ? primaryValues[2] : null;
    const valuationPercentile = typeof primaryValues[3] === "number" ? primaryValues[3] : null;
    const band = typeof primaryValues[4] === "string" ? primaryValues[4] : null;
    if (percentile === null) {
      lines.push("<div style=\"margin-left:18px;opacity:.72\">历史分位：样本不足</div>");
    } else {
      lines.push(`<div style="margin-left:18px;opacity:.82">历史分位 ${percentile.toFixed(2)}%</div>`);
      if (valuationPercentile !== null && Math.abs(valuationPercentile - percentile) > 0.005) {
        lines.push(`<div style="margin-left:18px;opacity:.82">估值分位 ${valuationPercentile.toFixed(2)}%</div>`);
      }
      if (band) lines.push(`<div style="margin-left:18px;opacity:.82">估值档位 ${band}</div>`);
    }
  }
  if (auxiliary.riskFreeRateVisible) {
    const value = auxiliary.riskFreeRateByDate.get(date);
    lines.push(`<div>${tooltipMarker("#6f7c55")}${RISK_FREE_RATE_SERIES} ${value === undefined ? "--（无同日数据）" : `${value.toFixed(2)}%`}</div>`);
  }
  if (auxiliary.performanceVisible) {
    const value = auxiliary.performanceByDate.get(date);
    lines.push(`<div>${tooltipMarker("#b7791f")}${INDEX_PERFORMANCE_SERIES} ${value === undefined ? "--（无同日数据）" : formatPercent(value)}</div>`);
  }
  return lines.join("");
}

function summaryDetail(
  summary: { observationCount: number; percentile: number | null; valuationPercentile: number | null; average: number | null },
  metric: PanelMetric,
  comparisonMode: RiskFreeComparisonMode,
) {
  if (summary.percentile === null) return `共 ${summary.observationCount} 个有效观测，至少 20 个才判断估值档位`;
  const items = [`历史分位 ${summary.percentile.toFixed(2)}%`];
  if (summary.valuationPercentile !== null && Math.abs(summary.valuationPercentile - summary.percentile) > 0.005) {
    items.push(`估值分位 ${summary.valuationPercentile.toFixed(2)}%`);
  }
  items.push(`平均值 ${summary.average === null ? "--" : formatPointValue(summary.average, metric, comparisonMode)}`);
  items.push(`${summary.observationCount} 个观测`);
  return items.join(" · ");
}

export function BenchmarkValuationPanel({
  benchmarkName,
  points,
  pricePoints,
  lastSyncAt,
  lastSyncError,
}: {
  benchmarkName: string;
  points: BenchmarkValuationPoint[];
  pricePoints: Array<{ date: string; value: number }>;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}) {
  const initialMetric = METRICS.find((candidate) => points.some((point) => typeof metricValue(point, candidate.key) === "number"))?.key ?? "pe";
  const [metric, setMetric] = useState<PanelMetric>(initialMetric);
  const [range, setRange] = useState<BenchmarkValuationRange>("3y");
  const [comparisonMode, setComparisonMode] = useState<RiskFreeComparisonMode>("difference");
  const [auxiliaryVisibility, setAuxiliaryVisibility] = useState<AuxiliaryVisibility>(INITIAL_AUXILIARY_VISIBILITY);
  const valuationMetric = metric === "riskFreeComparison" ? "pe" : metric;
  const summary = useMemo(() => calculateValuationSummary(points, valuationMetric, range), [points, range, valuationMetric]);
  const comparison = useMemo(() => calculateRiskFreeComparison(points, range), [points, range]);
  const comparisonSummary = comparison.summaries[comparisonMode];
  const activeSummary = metric === "riskFreeComparison" ? comparisonSummary : summary;
  const metricConfig = METRICS.find((candidate) => candidate.key === valuationMetric)!;
  const primarySeriesName = metric === "riskFreeComparison"
    ? comparisonMode === "difference" ? "股息率减无风险利率" : "股息率除以无风险利率"
    : metricConfig.label;
  const tileSummaries = useMemo(() => METRICS.map((candidate) => ({
    ...candidate,
    summary: calculateValuationSummary(points, candidate.key, range),
  })), [points, range]);
  const performancePoints = useMemo(
    () => calculateBenchmarkPerformance(pricePoints, range, activeSummary.currentDate),
    [activeSummary.currentDate, pricePoints, range],
  );
  const riskFreeRatePoints = useMemo(() => {
    const firstDate = summary.points[0]?.date;
    const lastDate = summary.currentDate;
    if (metric !== "dividendYield" || !firstDate || !lastDate) return [];
    return points.flatMap((point) => typeof point.riskFreeRate === "number" && Number.isFinite(point.riskFreeRate) && point.date >= firstDate && point.date <= lastDate
      ? [[point.date, point.riskFreeRate] as [string, number]]
      : []);
  }, [metric, points, summary.currentDate, summary.points]);
  const hasPerformance = performancePoints.length >= 2;
  const hasRiskFreeRate = riskFreeRatePoints.length >= 2;
  const activeAuxiliaryVisibility = auxiliaryVisibility[metric];

  function toggleAuxiliary(key: "performance" | "riskFreeRate") {
    setAuxiliaryVisibility((current) => ({
      ...current,
      [metric]: {
        ...current[metric],
        [key]: !current[metric][key],
      },
    }));
  }

  const option = useMemo<EChartsOption>(() => {
    if (!activeSummary.points.length) return {};
    const primaryValues = activeSummary.points.map((point) => point.value);
    const scaleValues = metric === "dividendYield" && hasRiskFreeRate
      ? [...primaryValues, ...riskFreeRatePoints.map((point) => point[1])]
      : primaryValues;
    const minimum = Math.min(...scaleValues);
    const maximum = Math.max(...scaleValues);
    const padding = Math.max((maximum - minimum) * 0.08, Math.max(Math.abs(minimum), Math.abs(maximum)) * 0.03, 0.05);
    const canClampAtZero = metric !== "riskFreeComparison" || comparisonMode === "ratio";
    const lowerBound = canClampAtZero ? Math.max(0, minimum - padding) : minimum - padding;
    const upperBound = maximum + padding;
    const bounds = [lowerBound, ...activeSummary.thresholds, upperBound];
    const reverseBands = metric === "dividendYield" || metric === "riskFreeComparison";
    const verticalBands = reverseBands ? [...BANDS].reverse() : BANDS;
    const markAreaData = activeSummary.thresholds.length === 4 ? verticalBands.map((band, index) => ([
      {
        yAxis: bounds[index],
        name: band,
        itemStyle: { color: `${BAND_STYLES[band].line}22` },
        label: { color: BAND_STYLES[band].line, fontSize: 11, position: "insideLeft" },
      },
      { yAxis: bounds[index + 1] },
    ])) : [];
    const primaryData = activeSummary.points.map((point) => [
      point.date,
      point.value,
      point.percentile,
      point.valuationPercentile,
      point.band,
    ]);
    const riskFreeRateByDate = new Map(riskFreeRatePoints);
    const performanceByDate = new Map(performancePoints.map((point) => [point.date, point.returnPercent]));
    const series: NonNullable<EChartsOption["series"]> = [{
      name: primarySeriesName,
      type: "line",
      showSymbol: false,
      lineStyle: { width: 2.5, color: "#276c9b" },
      itemStyle: { color: "#276c9b" },
      data: primaryData,
      markArea: { silent: true, data: markAreaData as NonNullable<MarkAreaComponentOption["data"]> },
    }];
    if (hasRiskFreeRate && activeAuxiliaryVisibility.riskFreeRate) {
      series.push({
        name: RISK_FREE_RATE_SERIES,
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: "#6f7c55", type: "dashed" },
        itemStyle: { color: "#6f7c55" },
        tooltip: { show: false },
        data: riskFreeRatePoints,
      });
    }
    if (hasPerformance && activeAuxiliaryVisibility.performance) {
      series.push({
        name: INDEX_PERFORMANCE_SERIES,
        type: "line",
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { width: 2, color: "#b7791f" },
        itemStyle: { color: "#b7791f" },
        tooltip: { show: false },
        data: performancePoints.map((point) => [point.date, point.returnPercent]),
      });
    }
    return {
      animationDuration: 250,
      grid: { left: 8, right: 12, top: 20, bottom: 36, containLabel: true },
      tooltip: {
        trigger: "axis",
        className: "benchmark-valuation-tooltip",
        confine: true,
        appendToBody: false,
        axisPointer: { type: "line", snap: true },
        extraCssText: "max-width:min(280px,calc(100vw - 24px));white-space:normal;overflow-wrap:anywhere;line-height:1.55;",
        formatter: (params: unknown) => tooltipFormatter(params, primarySeriesName, metric, comparisonMode, {
          riskFreeRateVisible: hasRiskFreeRate && activeAuxiliaryVisibility.riskFreeRate,
          performanceVisible: hasPerformance && activeAuxiliaryVisibility.performance,
          riskFreeRateByDate,
          performanceByDate,
        }),
      },
      xAxis: { type: "time", axisLabel: { color: "#5e675d", hideOverlap: true }, axisLine: { lineStyle: { color: "#d7c8af" } }, splitLine: { show: false } },
      yAxis: [
        {
          type: "value",
          min: lowerBound,
          max: upperBound,
          splitNumber: 4,
          axisLabel: {
            color: "#5e675d",
            showMinLabel: false,
            showMaxLabel: false,
            formatter: (value: number) => metric === "riskFreeComparison"
              ? `${Number(value.toFixed(2))}${comparisonMode === "difference" ? "pp" : "×"}`
              : formatValuationAxisTick(value, valuationMetric),
          },
          splitLine: { lineStyle: { color: "#d7c8af", type: "dashed", opacity: 0.7 } },
        },
        {
          type: "value",
          show: hasPerformance && activeAuxiliaryVisibility.performance,
          position: "right",
          axisLabel: { color: "#9a621d", formatter: (value: number) => `${Number(value.toFixed(1))}%` },
          axisLine: { show: true, lineStyle: { color: "#b7791f" } },
          splitLine: { show: false },
        },
      ],
      series,
    };
  }, [activeAuxiliaryVisibility.performance, activeAuxiliaryVisibility.riskFreeRate, activeSummary.points, activeSummary.thresholds, comparisonMode, hasPerformance, hasRiskFreeRate, metric, performancePoints, primarySeriesName, riskFreeRatePoints, valuationMetric]);

  const hasHistory = activeSummary.points.length >= 2;
  const comparisonValue = comparisonSummary.current;
  const comparisonDate = comparisonSummary.currentDate;
  const comparisonLabel = comparisonMode === "difference" ? "股息率减无风险利率" : "股息率除以无风险利率";

  return (
    <section className="min-w-0 overflow-hidden border border-border bg-card p-4 lg:p-6" aria-labelledby="benchmark-valuation-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">官方估值与利率</p><h2 id="benchmark-valuation-title" className="mt-1 text-xl font-semibold lg:text-2xl">估值位置</h2></div>
        <p className="max-w-sm text-right text-xs leading-5 text-muted-foreground">各指标独立判断 · {lastSyncAt ? `同步于 ${lastSyncAt.slice(0, 10)}` : "尚未同步估值"}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        {tileSummaries.map((item) => {
          const active = item.key === metric;
          return <button key={item.key} type="button" onClick={() => setMetric(item.key)} aria-pressed={active} className={`min-w-0 bg-background p-3 text-left ${active ? "shadow-[inset_0_-3px_0_var(--accent)]" : ""}`}>
            <span className="block text-[11px] text-muted-foreground">{item.label}</span>
            <span className="mt-1 flex items-end justify-between gap-2"><strong className="text-xl font-semibold lg:text-2xl">{formatValue(item.summary.current, item.key)}</strong>{item.summary.band ? <span className={`shrink-0 px-2 py-1 text-[10px] font-semibold ${BAND_STYLES[item.summary.band].background} ${BAND_STYLES[item.summary.band].text}`}>{item.summary.band}</span> : null}</span>
            <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{item.summary.currentDate ?? "官方来源未披露"}</span>
          </button>;
        })}
        <button type="button" onClick={() => setMetric("riskFreeComparison")} aria-pressed={metric === "riskFreeComparison"} className={`min-w-0 bg-background p-3 text-left ${metric === "riskFreeComparison" ? "shadow-[inset_0_-3px_0_var(--accent)]" : ""}`}>
          <span className="block text-[11px] text-muted-foreground">股息率和无风险利率</span>
          <span className="mt-1 flex items-end justify-between gap-2"><strong className="text-xl font-semibold lg:text-2xl">{formatComparisonValue(comparison.summaries.difference.current, "difference")}</strong>{comparison.summaries.difference.band ? <span className={`shrink-0 px-2 py-1 text-[10px] font-semibold ${BAND_STYLES[comparison.summaries.difference.band].background} ${BAND_STYLES[comparison.summaries.difference.band].text}`}>{comparison.summaries.difference.band}</span> : null}</span>
          <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{comparison.summaries.difference.currentDate ?? "同日数据未披露"}</span>
        </button>
      </div>

      {metric === "riskFreeComparison" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex border border-border bg-background p-1" aria-label="股息率与无风险利率计算方式">
              {(["difference", "ratio"] as const).map((mode) => <button key={mode} type="button" aria-pressed={comparisonMode === mode} onClick={() => setComparisonMode(mode)} className={comparisonMode === mode ? "min-h-9 bg-foreground px-3 text-xs font-medium text-background" : "min-h-9 px-3 text-xs text-muted-foreground hover:bg-muted"}>{mode === "difference" ? "差值" : "比值"}</button>)}
            </div>
            <p className="font-mono text-xs text-muted-foreground">{comparisonDate ?? "--"}</p>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-px bg-border" aria-label={`${comparisonLabel}估值档位`}>
            {BANDS.map((band) => <div key={band} className={`px-1 py-2 text-center text-[10px] sm:text-xs ${comparisonSummary.band === band ? `${BAND_STYLES[band].background} ${BAND_STYLES[band].text} font-semibold` : "bg-background text-muted-foreground"}`}>{band}</div>)}
          </div>
          <div className="mt-4 min-w-0">
            <p className="text-sm font-semibold">{comparisonLabel} {formatComparisonValue(comparisonValue, comparisonMode)}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{summaryDetail(comparisonSummary, metric, comparisonMode)}</p>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-5 gap-px bg-border" aria-label={`${metricConfig.label}估值档位`}>
            {BANDS.map((band) => <div key={band} className={`px-1 py-2 text-center text-[10px] sm:text-xs ${summary.band === band ? `${BAND_STYLES[band].background} ${BAND_STYLES[band].text} font-semibold` : "bg-background text-muted-foreground"}`}>{band}</div>)}
          </div>
          <div className="mt-4 min-w-0">
            <p className="text-sm font-semibold">{metricConfig.label} {formatValue(summary.current, valuationMetric)}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{summaryDetail(summary, metric, comparisonMode)}</p>
          </div>
        </>
      )}

      {hasHistory ? (
        <>
          <div
            data-testid="benchmark-valuation-chart"
            data-index-performance-visible={activeAuxiliaryVisibility.performance ? "true" : "false"}
            data-risk-free-rate-visible={activeAuxiliaryVisibility.riskFreeRate ? "true" : "false"}
            data-benchmark-name={benchmarkName}
            className="mt-2 min-w-0 overflow-hidden"
          >
            <div data-testid="benchmark-valuation-legend" className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border px-1 pb-2 text-[11px] text-muted-foreground">
              <span className="inline-flex min-h-8 items-center gap-2 px-2"><span className="h-0.5 w-5 bg-[#276c9b]" />{primarySeriesName}</span>
              {hasRiskFreeRate ? <button data-testid="risk-free-rate-legend" type="button" aria-pressed={activeAuxiliaryVisibility.riskFreeRate} onClick={() => toggleAuxiliary("riskFreeRate")} className={activeAuxiliaryVisibility.riskFreeRate ? "inline-flex min-h-8 items-center gap-2 border border-[#6f7c55] bg-background px-2 text-foreground" : "inline-flex min-h-8 items-center gap-2 border border-border bg-background px-2 opacity-60"}><span className="w-5 border-t-2 border-dashed border-[#6f7c55]" />{RISK_FREE_RATE_SERIES}</button> : null}
              {hasPerformance ? <button data-testid="index-performance-legend" type="button" aria-pressed={activeAuxiliaryVisibility.performance} onClick={() => toggleAuxiliary("performance")} className={activeAuxiliaryVisibility.performance ? "inline-flex min-h-8 items-center gap-2 border border-[#b7791f] bg-background px-2 text-foreground" : "inline-flex min-h-8 items-center gap-2 border border-border bg-background px-2 opacity-60"}><span className="h-0.5 w-5 bg-[#b7791f]" />{INDEX_PERFORMANCE_SERIES}</button> : null}
            </div>
            <ThemedEChart option={option} height={400} />
          </div>
          <div data-testid="benchmark-valuation-range-controls-row" className="mt-1"><ValuationRangeMenu range={range} onChange={setRange} /></div>
        </>
      ) : activeSummary.points.length === 1 ? <div className="mt-4 flex min-h-32 items-center justify-center border border-dashed border-border bg-background px-6 text-center text-sm leading-6 text-muted-foreground">当前只有一个有效快照，至少两个同日观测才绘制历史曲线。</div> : <div className="mt-4 flex min-h-48 items-center justify-center border border-dashed border-border bg-background px-6 text-center text-sm leading-6 text-muted-foreground">现有数据源暂未披露该指标的有效历史数据。</div>}
      <p className="mt-3 border-l-2 border-[var(--warm-highlight)] pl-3 text-xs leading-5 text-muted-foreground">来源：中证官方 PE/PB、中证红利 D/P2、已导入历史 Excel，以及中债 10 年期国债收益率。指数业绩以所选区间首个交易日归零；差值与比值只使用同一日期的原始值。{lastSyncError ? `本次部分同步异常：${lastSyncError}` : "未披露字段保持为空。"}</p>
    </section>
  );
}

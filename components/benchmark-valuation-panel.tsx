"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption, MarkAreaComponentOption } from "echarts";
import { ThemedEChart } from "@/components/charts/themed-echart";
import {
  calculateRiskFreeComparison,
  calculateValuationSummary,
  formatValuationAxisTick,
  hasValuationHistory,
  type BenchmarkValuationBand,
  type BenchmarkValuationMetric,
  type BenchmarkValuationPoint,
  type BenchmarkValuationRange,
  type RiskFreeComparisonMode,
} from "@/lib/domain/benchmark-valuations";

type PanelMetric = BenchmarkValuationMetric | "riskFreeComparison";

const METRICS: Array<{ key: BenchmarkValuationMetric; label: string; suffix: string }> = [
  { key: "pe", label: "市盈率（PE）", suffix: "" },
  { key: "pb", label: "市净率（PB）", suffix: "" },
  { key: "dividendYield", label: "股息率", suffix: "%" },
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

export function BenchmarkValuationPanel({
  points,
  lastSyncAt,
  lastSyncError,
}: {
  points: BenchmarkValuationPoint[];
  lastSyncAt: string | null;
  lastSyncError: string | null;
}) {
  const initialMetric = METRICS.find((candidate) => points.some((point) => typeof metricValue(point, candidate.key) === "number"))?.key ?? "pe";
  const [metric, setMetric] = useState<PanelMetric>(initialMetric);
  const [range, setRange] = useState<BenchmarkValuationRange>("3y");
  const [comparisonMode, setComparisonMode] = useState<RiskFreeComparisonMode>("difference");
  const valuationMetric = metric === "riskFreeComparison" ? "pe" : metric;
  const summary = useMemo(() => calculateValuationSummary(points, valuationMetric, range), [points, range, valuationMetric]);
  const comparison = useMemo(() => calculateRiskFreeComparison(points, range), [points, range]);
  const hasHistory = useMemo(() => metric === "riskFreeComparison"
    ? comparison.points.filter((point) => comparisonMode === "difference" || point.ratio !== null).length >= 2
    : hasValuationHistory(points, valuationMetric), [comparison.points, comparisonMode, metric, points, valuationMetric]);
  const metricConfig = METRICS.find((candidate) => candidate.key === valuationMetric)!;
  const tileSummaries = useMemo(() => METRICS.map((candidate) => ({
    ...candidate,
    summary: calculateValuationSummary(points, candidate.key, range),
  })), [points, range]);

  const option = useMemo<EChartsOption>(() => {
    if (metric === "riskFreeComparison") {
      const chartPoints = comparison.points.flatMap((point) => {
        const value = comparisonMode === "difference" ? point.difference : point.ratio;
        return value === null ? [] : [[point.date, value] as [string, number]];
      });
      if (!chartPoints.length) return {};
      const values = chartPoints.map((point) => point[1]);
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const padding = Math.max((maximum - minimum) * 0.08, Math.abs(maximum) * 0.03, 0.05);
      const suffix = comparisonMode === "difference" ? " 个百分点" : " 倍";
      return {
        animationDuration: 250,
        grid: { left: 8, right: 12, top: 20, bottom: 36, containLabel: true },
        tooltip: { trigger: "axis", valueFormatter: (value) => `${Number(value).toFixed(2)}${suffix}` },
        xAxis: { type: "time", axisLabel: { color: "#5e675d" }, axisLine: { lineStyle: { color: "#d7c8af" } }, splitLine: { show: false } },
        yAxis: { type: "value", min: minimum - padding, max: maximum + padding, splitNumber: 4, axisLabel: { color: "#5e675d", formatter: (value: number) => String(Number(value.toFixed(2))) }, splitLine: { lineStyle: { color: "#d7c8af", type: "dashed", opacity: 0.7 } } },
        series: [{ name: comparisonMode === "difference" ? "股息率减无风险利率" : "股息率除以无风险利率", type: "line", showSymbol: false, lineStyle: { width: 2.5, color: "#a85d2f" }, itemStyle: { color: "#a85d2f" }, data: chartPoints }],
      };
    }
    if (!summary.points.length) return {};
    const values = summary.points.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const padding = Math.max((maximum - minimum) * 0.08, maximum * 0.03, 0.05);
    const bounds = [Math.max(0, minimum - padding), ...summary.thresholds, maximum + padding];
    const verticalBands = metric === "dividendYield" ? [...BANDS].reverse() : BANDS;
    const markAreaData = summary.thresholds.length === 4 ? verticalBands.map((band, index) => ([
      { yAxis: bounds[index], name: band, itemStyle: { color: `${BAND_STYLES[band].line}12` }, label: { color: BAND_STYLES[band].line, fontSize: 11, position: "insideLeft" } },
      { yAxis: bounds[index + 1] },
    ])) : [];
    return {
      animationDuration: 250,
      grid: { left: 8, right: 12, top: 20, bottom: 36, containLabel: true },
      tooltip: { trigger: "axis", valueFormatter: (value) => `${Number(value).toFixed(2)}${metricConfig.suffix}` },
      xAxis: { type: "time", axisLabel: { color: "#5e675d" }, axisLine: { lineStyle: { color: "#d7c8af" } }, splitLine: { show: false } },
      yAxis: { type: "value", min: bounds[0], max: bounds.at(-1), splitNumber: 4, axisLabel: { color: "#5e675d", showMinLabel: false, showMaxLabel: false, formatter: (value: number) => formatValuationAxisTick(value, valuationMetric) }, splitLine: { lineStyle: { color: "#d7c8af", type: "dashed", opacity: 0.7 } } },
      series: [{ name: metricConfig.label, type: "line", showSymbol: false, lineStyle: { width: 2.5, color: "#276c9b" }, itemStyle: { color: "#276c9b" }, data: summary.points.map((point) => [point.date, point.value]), markArea: { silent: true, data: markAreaData as NonNullable<MarkAreaComponentOption["data"]> } }],
    };
  }, [comparison.points, comparisonMode, metric, metricConfig.label, metricConfig.suffix, summary.points, summary.thresholds, valuationMetric]);

  const comparisonValue = comparison.latest ? (comparisonMode === "difference" ? comparison.latest.difference : comparison.latest.ratio) : null;
  const activePointCount = metric === "riskFreeComparison" ? comparison.points.length : summary.points.length;

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
          <strong className="mt-1 block text-xl font-semibold lg:text-2xl">{formatComparisonValue(comparison.latest?.difference ?? null, "difference")}</strong>
          <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{comparison.latest?.date ?? "同日数据未披露"}</span>
        </button>
      </div>

      {metric === "riskFreeComparison" ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
            <div className="bg-background p-3"><p className="text-[11px] text-muted-foreground">股息率</p><p className="mt-1 text-lg font-semibold">{comparison.latest ? `${comparison.latest.dividendYield.toFixed(2)}%` : "--"}</p></div>
            <div className="bg-background p-3"><p className="text-[11px] text-muted-foreground">10年期无风险利率</p><p className="mt-1 text-lg font-semibold">{comparison.latest ? `${comparison.latest.riskFreeRate.toFixed(2)}%` : "--"}</p></div>
            <div className="bg-background p-3"><p className="text-[11px] text-muted-foreground">差值</p><p className="mt-1 text-lg font-semibold">{formatComparisonValue(comparison.latest?.difference ?? null, "difference")}</p></div>
            <div className="bg-background p-3"><p className="text-[11px] text-muted-foreground">比值</p><p className="mt-1 text-lg font-semibold">{formatComparisonValue(comparison.latest?.ratio ?? null, "ratio")}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex border border-border bg-background p-1" aria-label="股息率与无风险利率计算方式">
              {(["difference", "ratio"] as const).map((mode) => <button key={mode} type="button" aria-pressed={comparisonMode === mode} onClick={() => setComparisonMode(mode)} className={comparisonMode === mode ? "min-h-9 bg-foreground px-3 text-xs font-medium text-background" : "min-h-9 px-3 text-xs text-muted-foreground hover:bg-muted"}>{mode === "difference" ? "差值" : "比值"}</button>)}
            </div>
            <p className="text-xs text-muted-foreground">{comparison.latest?.date ?? "--"} · {formatComparisonValue(comparisonValue, comparisonMode)}</p>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-5 gap-px bg-border" aria-label={`${metricConfig.label}估值档位`}>
            {BANDS.map((band) => <div key={band} className={`px-1 py-2 text-center text-[10px] sm:text-xs ${summary.band === band ? `${BAND_STYLES[band].background} ${BAND_STYLES[band].text} font-semibold` : "bg-background text-muted-foreground"}`}>{band}</div>)}
          </div>
          <div className="mt-4 min-w-0"><p className="text-sm font-semibold">{metricConfig.label} {formatValue(summary.current, valuationMetric)}</p><p className="mt-1 text-xs text-muted-foreground">{summary.percentile === null ? `共 ${summary.observationCount} 个有效观测，至少 20 个才判断估值档位` : `历史分位 ${summary.percentile.toFixed(2)}% · 平均值 ${formatValue(summary.average, valuationMetric)} · ${summary.observationCount} 个观测`}</p></div>
        </>
      )}

      {hasHistory ? (
        <><div data-testid="benchmark-valuation-chart" className="mt-2 min-w-0 overflow-hidden"><ThemedEChart option={option} height={380} /></div><div data-testid="benchmark-valuation-range-controls-row" className="mt-1"><ValuationRangeMenu range={range} onChange={setRange} /></div></>
      ) : activePointCount === 1 ? <div className="mt-4 flex min-h-32 items-center justify-center border border-dashed border-border bg-background px-6 text-center text-sm leading-6 text-muted-foreground">当前只有一个有效快照，至少两个同日观测才绘制历史曲线。</div> : <div className="mt-4 flex min-h-48 items-center justify-center border border-dashed border-border bg-background px-6 text-center text-sm leading-6 text-muted-foreground">现有数据源暂未披露该指标的有效历史数据。</div>}
      <p className="mt-3 border-l-2 border-[var(--warm-highlight)] pl-3 text-xs leading-5 text-muted-foreground">来源：中证官方 PE/PB、中证红利 D/P2、已导入历史 Excel，以及中债 10 年期国债收益率。差值与比值只使用同一日期的原始值；{lastSyncError ? `本次部分同步异常：${lastSyncError}` : "未披露字段保持为空。"}</p>
    </section>
  );
}

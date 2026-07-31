"use client";

import type { EChartsOption } from "echarts";
import { useMemo, useState } from "react";
import { ChartRangeControls } from "@/components/chart-range-controls";
import { ThemedEChart } from "@/components/charts/themed-echart";
import { resolvePresetRange, type ChartDateRange, type ChartRangePreset } from "@/lib/chart-time-range";
import { computeResearchMetrics } from "@/lib/funds/comparison";
import { drawdownToneClass, returnToneClass } from "@/lib/visual-tones";

type BenchmarkPoint = { date: string; value: number; normalizedValue: number };

function percent(value: number | null) {
  return value === null ? "--" : `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function buildChartValues(points: BenchmarkPoint[], view: "performance" | "drawdown") {
  const base = points[0]?.value;
  let runningPeak = base ?? 0;
  return points.map((point) => {
    runningPeak = Math.max(runningPeak, point.value);
    return {
      date: point.date,
      value: view === "performance" && base ? (point.value / base - 1) * 100 : runningPeak ? (point.value / runningPeak - 1) * 100 : 0,
    };
  });
}

export function BenchmarkDetailPerformance({ points, color }: { points: BenchmarkPoint[]; color: string }) {
  const availableRange = points.length ? { from: points[0]!.date, to: points.at(-1)!.date } : null;
  const [preset, setPreset] = useState<ChartRangePreset>("inception");
  const [customFrom, setCustomFrom] = useState(availableRange?.from ?? "");
  const [customTo, setCustomTo] = useState(availableRange?.to ?? "");
  const [requestedRange, setRequestedRange] = useState<ChartDateRange | null>(null);
  const [chartView, setChartView] = useState<"performance" | "drawdown">("performance");
  const visiblePoints = useMemo(() => points.filter((point) => !requestedRange || point.date >= requestedRange.from && point.date <= requestedRange.to), [points, requestedRange]);
  const metrics = useMemo(() => computeResearchMetrics(visiblePoints), [visiblePoints]);
  const chartValues = useMemo(() => buildChartValues(visiblePoints, chartView), [chartView, visiblePoints]);
  const option = useMemo<EChartsOption>(() => ({
    animation: false,
    grid: { left: 16, right: 22, top: 22, bottom: 34, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (value) => `${Number(value).toFixed(2)}%` },
    xAxis: { type: "category", boundaryGap: false, data: chartValues.map((point) => point.date), axisLabel: { color: "#5e675d", hideOverlap: true, formatter: (value: string) => value.slice(2) } },
    yAxis: { type: "value", axisLabel: { color: "#5e675d", formatter: "{value}%" }, splitLine: { lineStyle: { color: "#d7c8af", opacity: 0.5 } } },
    series: [{ type: "line", data: chartValues.map((point) => point.value), smooth: true, symbol: "none", lineStyle: { color, width: 2 }, areaStyle: { color, opacity: 0.08 } }],
  }), [chartValues, color]);

  function applyPreset(nextPreset: ChartRangePreset) {
    setPreset(nextPreset);
    if (!availableRange || nextPreset === "custom") return;
    setRequestedRange(nextPreset === "inception" ? null : resolvePresetRange(nextPreset, availableRange));
  }

  function applyCustom() {
    if (!customFrom || !customTo || customFrom > customTo) return;
    setRequestedRange({ from: customFrom, to: customTo });
  }

  return (
    <section className="border border-border bg-card p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Index Performance</p><h2 className="mt-1 text-2xl font-semibold">业绩与风险</h2></div>
        <ChartRangeControls preset={preset} customFrom={customFrom} customTo={customTo} disabled={!availableRange} onPresetChange={applyPreset} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} onApplyCustom={applyCustom} />
      </div>
      <dl data-testid="benchmark-performance-metrics" className="mt-3 grid grid-cols-5 gap-px bg-border">
        {[["区间收益", metrics.rangeReturn], ["年化收益", metrics.annualizedReturn], ["最大回撤", metrics.maxDrawdown], ["年化波动", metrics.volatility], ["夏普", metrics.sharpeRatio]].map(([label, value]) => <div key={String(label)} className="min-w-0 bg-background px-1.5 py-2 sm:p-3"><dt className="truncate text-[9px] text-muted-foreground sm:text-[10px]">{label}</dt><dd className={`mt-1 truncate text-[11px] font-semibold sm:text-sm ${label === "最大回撤" ? drawdownToneClass(Number(value ?? 0)) : returnToneClass(Number(value ?? 0))}`}>{label === "夏普" ? value === null ? "--" : Number(value).toFixed(2) : percent(value as number | null)}</dd></div>)}
      </dl>
      <div className="mt-4 flex w-full max-w-xs gap-px bg-border p-px" role="group" aria-label="指数图表视图">
        {(["performance", "drawdown"] as const).map((view) => <button key={view} type="button" aria-pressed={chartView === view} onClick={() => setChartView(view)} className={chartView === view ? "min-h-10 flex-1 bg-foreground px-4 text-xs text-background" : "min-h-10 flex-1 bg-background px-4 text-xs text-muted-foreground"}>{view === "performance" ? "业绩曲线" : "回撤曲线"}</button>)}
      </div>
      {chartValues.length >= 2 ? <div className="mt-3 min-w-0 overflow-hidden"><ThemedEChart option={option} height={360} /></div> : <p className="mt-5 border border-dashed border-border bg-background p-5 text-sm text-muted-foreground">当前区间不足两个有效点，暂不能绘制业绩曲线。</p>}
      {visiblePoints.length ? <p className="mt-2 font-mono text-[11px] text-muted-foreground">{visiblePoints[0]?.date} 至 {visiblePoints.at(-1)?.date} · {visiblePoints.length} 个点</p> : null}
    </section>
  );
}

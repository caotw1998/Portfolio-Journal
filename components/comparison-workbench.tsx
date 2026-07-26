"use client";

import type { EChartsOption } from "echarts";
import { useState, useTransition } from "react";
import { ThemedEChart } from "@/components/charts/themed-echart";

type Option = { id: string; name: string; code: string };
type Comparison = {
  range: { from: string; to: string } | null;
  warnings: string[];
  series: Array<{
    id: string;
    kind: "fund" | "benchmark";
    name: string;
    code: string;
    basis: string;
    points: Array<{ date: string; value: number; normalizedValue: number }>;
    metrics: { rangeReturn: number | null; annualizedReturn: number | null; maxDrawdown: number | null; volatility: number | null; sharpeRatio: number | null };
  }>;
};

const ranges = [
  { label: "1月", months: 1 }, { label: "3月", months: 3 }, { label: "6月", months: 6 },
  { label: "今年", months: 0 }, { label: "1年", months: 12 }, { label: "3年", months: 36 },
  { label: "5年", months: 60 }, { label: "全部", months: -1 },
];

function fromForMonths(months: number) {
  if (months < 0) return undefined;
  const date = new Date();
  if (months === 0) date.setUTCMonth(0, 1);
  else date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function percent(value: number | null) {
  return value === null ? "--" : `${(value * 100).toFixed(2)}%`;
}

function basisLabel(basis: string) {
  if (basis === "dividend_reinvested") return "分红再投资复权";
  if (basis === "close") return "指数点位";
  return basis;
}

export function ComparisonWorkbench({ funds, benchmarks, initialFundIds = [], chartSingleColor, chartSeriesColors }: { funds: Option[]; benchmarks: Option[]; initialFundIds?: string[]; chartSingleColor: string; chartSeriesColors: string[] }) {
  const [fundIds, setFundIds] = useState(initialFundIds);
  const [benchmarkId, setBenchmarkId] = useState(benchmarks[0]?.id ?? "");
  const [months, setMonths] = useState(12);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleFund(id: string) {
    setFundIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 5 ? [...current, id] : current);
  }

  function compare() {
    setError(null);
    startTransition(async () => {
      const parameters = new URLSearchParams({ fundIds: fundIds.join(","), benchmarkId });
      const from = fromForMonths(months);
      if (from) parameters.set("from", from);
      const response = await fetch(`/api/research/compare?${parameters}`);
      const body = await response.json() as Comparison & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "对比失败。");
        return;
      }
      setComparison(body);
    });
  }

  const dates = comparison?.series[0]?.points.map((point) => point.date) ?? [];
  const colors = comparison?.series.length === 1 ? [chartSingleColor] : chartSeriesColors;
  const option: EChartsOption = {
    animationDuration: 600,
    grid: { left: 14, right: 28, top: 38, bottom: 25, containLabel: true },
    tooltip: { trigger: "axis", backgroundColor: "#fffdf8", borderColor: "#d7c8af", textStyle: { color: "#1f2520" } },
    legend: { top: 0, textStyle: { color: "#5e675d" } },
    xAxis: { type: "category", boundaryGap: false, data: dates, axisLabel: { hideOverlap: true, color: "#5e675d" } },
    yAxis: { type: "value", scale: true, axisLabel: { formatter: (value: number) => value.toFixed(2), color: "#5e675d" }, splitLine: { lineStyle: { color: "#d7c8af", opacity: 0.45 } } },
    series: comparison?.series.map((series, index) => ({ name: `${series.name} (${series.code})`, type: "line", showSymbol: false, smooth: 0.12, data: series.points.map((point) => point.normalizedValue), lineStyle: { width: series.kind === "benchmark" ? 2 : 2.6, type: series.kind === "benchmark" ? "dashed" : "solid", color: colors[index] }, itemStyle: { color: colors[index] } })) ?? [],
  };

  return (
    <div className="grid gap-5">
      <section className="grid gap-5 border border-border bg-card p-5 lg:grid-cols-[1fr_0.55fr]">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Funds · 最多 5 只</p><div className="mt-3 flex flex-wrap gap-2">{funds.map((fund) => <button key={fund.id} onClick={() => toggleFund(fund.id)} className={`border px-3 py-2 text-sm ${fundIds.includes(fund.id) ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background"}`}>{fund.name} · {fund.code}</button>)}</div></div>
        <label className="text-sm"><span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Benchmark · 仅 1 个</span><select value={benchmarkId} onChange={(event) => setBenchmarkId(event.target.value)} className="mt-3 w-full border border-border bg-background px-3 py-2.5"><option value="">请选择指数</option>{benchmarks.map((benchmark) => <option key={benchmark.id} value={benchmark.id}>{benchmark.name} · {benchmark.code}</option>)}</select></label>
        <div className="flex flex-wrap gap-2 lg:col-span-2">{ranges.map((range) => <button key={range.label} onClick={() => setMonths(range.months)} className={`border px-3 py-1.5 text-xs ${months === range.months ? "border-[var(--warm-highlight)] text-foreground" : "border-border text-muted-foreground"}`}>{range.label}</button>)}<button onClick={compare} disabled={isPending || !fundIds.length || !benchmarkId} className="ml-auto bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50">{isPending ? "计算中…" : "开始对比"}</button></div>
        {error ? <p className="text-sm text-red-700 lg:col-span-2">{error}</p> : null}
      </section>
      {comparison ? <>
        <section className="border border-border bg-card p-5"><div className="flex flex-wrap justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Normalized at 1.0</p><h2 className="mt-1 text-2xl font-semibold">共同区间走势</h2></div><p className="font-mono text-xs text-muted-foreground">{comparison.range ? `${comparison.range.from} → ${comparison.range.to}` : "无共同区间"}</p></div>{comparison.series.length ? <div className="mt-4"><ThemedEChart option={option} height={420} /></div> : null}{comparison.warnings.map((warning) => <p key={warning} className="mt-2 border-l-2 border-[var(--warm-highlight)] pl-3 text-sm text-muted-foreground">{warning}</p>)}</section>
        {comparison.series.length ? <section className="overflow-x-auto border border-border bg-card"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-border bg-background text-xs text-muted-foreground"><tr><th className="p-4">序列 / 口径</th><th className="p-4">区间收益</th><th className="p-4">年化收益</th><th className="p-4">最大回撤</th><th className="p-4">年化波动</th><th className="p-4">夏普</th></tr></thead><tbody className="divide-y divide-border">{comparison.series.map((series) => <tr key={series.id}><td className="p-4 font-medium">{series.name}<span className="ml-2 font-mono text-xs text-muted-foreground">{series.code} · {basisLabel(series.basis)}</span></td><td className="p-4">{percent(series.metrics.rangeReturn)}</td><td className="p-4">{percent(series.metrics.annualizedReturn)}</td><td className="p-4">{percent(series.metrics.maxDrawdown)}</td><td className="p-4">{percent(series.metrics.volatility)}</td><td className="p-4">{series.metrics.sharpeRatio?.toFixed(2) ?? "--"}</td></tr>)}</tbody></table></section> : null}
      </> : null}
    </div>
  );
}

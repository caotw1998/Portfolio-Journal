"use client";

import type { EChartsOption } from "echarts";
import { useMemo, useState, useTransition } from "react";
import { ThemedEChart } from "@/components/charts/themed-echart";
import { searchLibraryOptions } from "@/lib/funds/library-search";

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
    metrics: {
      rangeReturn: number | null;
      annualizedReturn: number | null;
      maxDrawdown: number | null;
      volatility: number | null;
      sharpeRatio: number | null;
    };
  }>;
};

const ranges = [
  { label: "1月", months: 1 },
  { label: "3月", months: 3 },
  { label: "6月", months: 6 },
  { label: "今年", months: 0 },
  { label: "1年", months: 12 },
  { label: "3年", months: 36 },
  { label: "5年", months: 60 },
  { label: "全部", months: -1 },
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

export function ComparisonWorkbench({
  funds,
  benchmarks,
  initialFundIds = [],
  chartSingleColor,
  chartSeriesColors,
}: {
  funds: Option[];
  benchmarks: Option[];
  initialFundIds?: string[];
  chartSingleColor: string;
  chartSeriesColors: string[];
}) {
  const [fundIds, setFundIds] = useState(initialFundIds);
  const [benchmarkId, setBenchmarkId] = useState("");
  const [fundQuery, setFundQuery] = useState("");
  const [benchmarkQuery, setBenchmarkQuery] = useState("");
  const [months, setMonths] = useState(12);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedFunds = useMemo(
    () =>
      fundIds
        .map((id) => funds.find((fund) => fund.id === id))
        .filter((fund): fund is Option => Boolean(fund)),
    [fundIds, funds],
  );
  const selectedBenchmark = benchmarks.find(
    (benchmark) => benchmark.id === benchmarkId,
  );
  const matchedFunds = useMemo(
    () => searchLibraryOptions(funds, fundQuery, new Set(fundIds)),
    [fundIds, fundQuery, funds],
  );
  const matchedBenchmarks = useMemo(
    () =>
      searchLibraryOptions(
        benchmarks,
        benchmarkQuery,
        new Set(benchmarkId ? [benchmarkId] : []),
      ),
    [benchmarkId, benchmarkQuery, benchmarks],
  );

  function addFund(id: string) {
    setFundIds((current) =>
      current.includes(id) || current.length >= 5 ? current : [...current, id],
    );
    setFundQuery("");
  }

  function compare() {
    setError(null);
    startTransition(async () => {
      const parameters = new URLSearchParams({
        fundIds: fundIds.join(","),
        benchmarkId,
      });
      const from = fromForMonths(months);
      if (from) parameters.set("from", from);
      const response = await fetch(`/api/research/compare?${parameters}`);
      const body = (await response.json()) as Comparison & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "对比失败。");
        return;
      }
      setComparison(body);
    });
  }

  const dates = comparison?.series[0]?.points.map((point) => point.date) ?? [];
  const colors =
    comparison?.series.length === 1 ? [chartSingleColor] : chartSeriesColors;
  const option: EChartsOption = {
    animationDuration: 600,
    grid: { left: 14, right: 28, top: 38, bottom: 25, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#fffdf8",
      borderColor: "#d7c8af",
      textStyle: { color: "#1f2520" },
    },
    legend: { top: 0, textStyle: { color: "#5e675d" } },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dates,
      axisLabel: { hideOverlap: true, color: "#5e675d" },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: {
        formatter: (value: number) => value.toFixed(2),
        color: "#5e675d",
      },
      splitLine: { lineStyle: { color: "#d7c8af", opacity: 0.45 } },
    },
    series:
      comparison?.series.map((series, index) => ({
        name: `${series.name} (${series.code})`,
        type: "line",
        showSymbol: false,
        smooth: 0.12,
        data: series.points.map((point) => point.normalizedValue),
        lineStyle: {
          width: series.kind === "benchmark" ? 2 : 2.6,
          type: series.kind === "benchmark" ? "dashed" : "solid",
          color: colors[index],
        },
        itemStyle: { color: colors[index] },
      })) ?? [],
  };

  return (
    <div className="grid gap-5">
      <section
        id="comparison-selection"
        className="grid grid-cols-1 scroll-mt-20 gap-5 border border-border bg-card p-5 lg:grid-cols-2 lg:scroll-mt-6 layout-mobile:!grid-cols-1 layout-desktop:grid-cols-2"
      >
        <div data-testid="comparison-fund-search" className="w-full min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Funds · 最多 5 只
          </p>
          <label className="mt-3 grid gap-1 text-xs text-muted-foreground">
            搜索研究库基金
            <input
              aria-label="搜索对比基金"
              value={fundQuery}
              onChange={(event) => setFundQuery(event.target.value)}
              placeholder="输入基金名称或代码"
              autoComplete="off"
              className="w-full min-w-0 border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </label>
          {fundQuery.trim() ? (
            <div className="mt-1 max-h-64 overflow-y-auto border border-border bg-card shadow-lg">
              {matchedFunds.map((fund) => (
                <button
                  type="button"
                  key={fund.id}
                  onClick={() => addFund(fund.id)}
                  disabled={fundIds.length >= 5}
                  className="grid w-full grid-cols-[1fr_auto] gap-3 border-b border-border px-3 py-3 text-left text-sm last:border-0 hover:bg-background disabled:opacity-45"
                >
                  <span>{fund.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {fund.code}
                  </span>
                </button>
              ))}
              {!matchedFunds.length ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  没有匹配的未选基金。
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedFunds.map((fund) => (
              <span
                key={fund.id}
                className="flex items-center gap-2 border border-accent bg-background px-3 py-2 text-sm"
              >
                <span>
                  {fund.name} ·{" "}
                  <span className="font-mono text-xs">{fund.code}</span>
                </span>
                <button
                  type="button"
                  aria-label={`移除对比基金 ${fund.name}`}
                  onClick={() =>
                    setFundIds((current) =>
                      current.filter((id) => id !== fund.id),
                    )
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
            {!selectedFunds.length ? (
              <p className="text-sm text-muted-foreground">
                先搜索并添加研究库基金，不会一次展示全部标的。
              </p>
            ) : null}
          </div>
        </div>
        <div data-testid="comparison-benchmark-search" className="w-full min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Benchmark · 仅 1 个
          </p>
          <label className="mt-3 grid gap-1 text-xs text-muted-foreground">
            搜索指数库
            <input
              aria-label="搜索对比指数"
              value={benchmarkQuery}
              onChange={(event) => setBenchmarkQuery(event.target.value)}
              placeholder="输入指数名称或代码"
              autoComplete="off"
              className="w-full min-w-0 border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </label>
          {benchmarkQuery.trim() ? (
            <div className="mt-1 max-h-64 overflow-y-auto border border-border bg-card shadow-lg">
              {matchedBenchmarks.map((benchmark) => (
                <button
                  type="button"
                  key={benchmark.id}
                  onClick={() => {
                    setBenchmarkId(benchmark.id);
                    setBenchmarkQuery("");
                  }}
                  className="grid w-full grid-cols-[1fr_auto] gap-3 border-b border-border px-3 py-3 text-left text-sm last:border-0 hover:bg-background"
                >
                  <span>{benchmark.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {benchmark.code}
                  </span>
                </button>
              ))}
              {!matchedBenchmarks.length ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  没有匹配的指数。
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3">
            {selectedBenchmark ? (
              <span className="inline-flex items-center gap-2 border border-accent bg-background px-3 py-2 text-sm">
                <span>
                  {selectedBenchmark.name} ·{" "}
                  <span className="font-mono text-xs">
                    {selectedBenchmark.code}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`移除对比指数 ${selectedBenchmark.name}`}
                  onClick={() => setBenchmarkId("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ) : (
              <p className="text-sm text-muted-foreground">
                搜索并选择一个指数作为比较基准。
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:col-span-2">
          {ranges.map((range) => (
            <button
              key={range.label}
              onClick={() => setMonths(range.months)}
              className={`border px-3 py-1.5 text-xs ${months === range.months ? "border-[var(--warm-highlight)] text-foreground" : "border-border text-muted-foreground"}`}
            >
              {range.label}
            </button>
          ))}
          <button
            onClick={compare}
            disabled={isPending || !fundIds.length || !benchmarkId}
            className="ml-auto bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {isPending ? "计算中…" : "开始对比"}
          </button>
        </div>
        {error ? (
          <p className="text-sm text-red-700 lg:col-span-2">{error}</p>
        ) : null}
      </section>
      {comparison ? (
        <>
          <section
            id="comparison-results"
            className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Normalized at 1.0
                </p>
                <h2 className="mt-1 text-2xl font-semibold">共同区间走势</h2>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {comparison.range
                  ? `${comparison.range.from} → ${comparison.range.to}`
                  : "无共同区间"}
              </p>
            </div>
            {comparison.series.length ? (
              <div className="mt-4">
                <ThemedEChart option={option} height={420} />
              </div>
            ) : null}
            {comparison.warnings.map((warning) => (
              <p
                key={warning}
                className="mt-2 border-l-2 border-[var(--warm-highlight)] pl-3 text-sm text-muted-foreground"
              >
                {warning}
              </p>
            ))}
          </section>
          {comparison.series.length ? (
            <section className="overflow-x-auto border border-border bg-card">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-border bg-background text-xs text-muted-foreground">
                  <tr>
                    <th className="p-4">序列 / 口径</th>
                    <th className="p-4">区间收益</th>
                    <th className="p-4">年化收益</th>
                    <th className="p-4">最大回撤</th>
                    <th className="p-4">年化波动</th>
                    <th className="p-4">夏普</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comparison.series.map((series) => (
                    <tr key={series.id}>
                      <td className="p-4 font-medium">
                        {series.name}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {series.code} · {basisLabel(series.basis)}
                        </span>
                      </td>
                      <td className="p-4">
                        {percent(series.metrics.rangeReturn)}
                      </td>
                      <td className="p-4">
                        {percent(series.metrics.annualizedReturn)}
                      </td>
                      <td className="p-4">
                        {percent(series.metrics.maxDrawdown)}
                      </td>
                      <td className="p-4">
                        {percent(series.metrics.volatility)}
                      </td>
                      <td className="p-4">
                        {series.metrics.sharpeRatio?.toFixed(2) ?? "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      ) : (
        <section
          id="comparison-results"
          className="scroll-mt-20 border border-dashed border-border bg-card p-8 text-sm text-muted-foreground lg:scroll-mt-6"
        >
          搜索并加入基金和指数后，点击“开始对比”查看共同区间结果。
        </section>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { searchLibraryFunds } from "@/lib/funds/model-portfolio";
import { searchLibraryOptions } from "@/lib/funds/library-search";

type Backtest = {
  actualStartDate: string;
  points: Array<{ date: string; value: number; drawdown: number }>;
  metrics: {
    totalReturn: number | null;
    annualizedReturn: number | null;
    maxDrawdown: number | null;
    volatility: number | null;
    sharpe: number | null;
    sortino: number | null;
    calmar: number | null;
  };
  turnover: number;
  benchmark: { name: string; excessTotalReturn: number | null } | null;
};

export function ModelPortfolioWorkbench({
  funds,
  benchmarks,
  portfolios,
}: {
  funds: Array<{ id: string; code: string; name: string }>;
  benchmarks: Array<{ id: string; name: string; code: string }>;
  portfolios: Array<{
    id: string;
    name: string;
    startDate: string;
    rebalanceFrequency: string;
    allocations: Array<{ fundId: string; name: string; targetWeight: number }>;
  }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("核心观察组合");
  const [startDate, setStartDate] = useState("2021-01-01");
  const [frequency, setFrequency] = useState("quarterly");
  const [benchmarkId, setBenchmarkId] = useState("");
  const [benchmarkQuery, setBenchmarkQuery] = useState("");
  const [cost, setCost] = useState("0");
  const [cashReturn, setCashReturn] = useState("0");
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [fundQuery, setFundQuery] = useState("");
  const [selectedFundIds, setSelectedFundIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Backtest | null>(null);
  const totalWeight = useMemo(
    () =>
      Object.values(weights).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0,
      ),
    [weights],
  );
  const selectedFunds = useMemo(
    () =>
      selectedFundIds
        .map((id) => funds.find((fund) => fund.id === id))
        .filter((fund): fund is { id: string; code: string; name: string } =>
          Boolean(fund),
        ),
    [funds, selectedFundIds],
  );
  const matchedFunds = useMemo(
    () => searchLibraryFunds(funds, fundQuery, new Set(selectedFundIds)),
    [fundQuery, funds, selectedFundIds],
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
  const selectedBenchmark = benchmarks.find(
    (benchmark) => benchmark.id === benchmarkId,
  );
  const percent = (value: number | null) =>
    value === null
      ? "--"
      : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
  const chartPath = useMemo(() => {
    if (!result?.points.length) return "";
    const values = result.points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return result.points
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${((index / Math.max(result.points.length - 1, 1)) * 760).toFixed(1)},${(180 - ((point.value - min) / span) * 160).toFixed(1)}`,
      )
      .join(" ");
  }, [result]);

  function create(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const allocations = Object.entries(weights)
        .filter(([, value]) => Number(value) > 0)
        .map(([fundId, value]) => ({
          fundId,
          targetWeight: Number(value) / 100,
        }));
      const response = await fetch("/api/model-portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startDate,
          benchmarkId,
          rebalanceFrequency: frequency,
          transactionCostBps: Number(cost),
          cashAnnualReturn: Number(cashReturn) / 100,
          allocations,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "创建失败。");
        return;
      }
      setMessage("模拟组合已保存，可在右侧运行回测。");
      router.refresh();
    });
  }
  function backtest(id: string) {
    setMessage("正在计算共同有效区间……");
    startTransition(async () => {
      const response = await fetch(`/api/model-portfolios/${id}/backtest`);
      const body = (await response.json()) as {
        data?: Backtest;
        error?: string;
      };
      if (!response.ok) {
        setMessage(body.error ?? "回测失败。");
        return;
      }
      setResult(body.data ?? null);
      setMessage("回测完成。");
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      await fetch(`/api/model-portfolios/${id}`, { method: "DELETE" });
      setResult(null);
      router.refresh();
    });
  }
  function addFund(id: string) {
    setSelectedFundIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
    setFundQuery("");
  }
  function removeFund(id: string) {
    setSelectedFundIds((current) => current.filter((item) => item !== id));
    setWeights((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[.9fr_1.1fr]">
      <form
        id="portfolio-allocation"
        onSubmit={create}
        className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6"
      >
        <h2 className="text-2xl font-semibold">目标权重</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-muted-foreground">
            组合名称
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            起始日期
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            再平衡
            <select
              value={frequency}
              onChange={(event) => setFrequency(event.target.value)}
              className="border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="none">不再平衡</option>
              <option value="monthly">每月</option>
              <option value="quarterly">每季度</option>
              <option value="annual">每年</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            交易成本（基点）
            <input
              type="number"
              min="0"
              max="1000"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              className="border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            现金年化收益（%）
            <input
              type="number"
              step="0.01"
              value={cashReturn}
              onChange={(event) => setCashReturn(event.target.value)}
              className="border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>
        <div className="relative mt-5">
          <label className="grid gap-1 text-xs text-muted-foreground">
            搜索比较指数
            <input
              aria-label="搜索模拟组合指数"
              value={benchmarkQuery}
              onChange={(event) => setBenchmarkQuery(event.target.value)}
              placeholder="输入指数名称或代码；可不选择"
              autoComplete="off"
              className="border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </label>
          {benchmarkQuery.trim() ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-border bg-card shadow-lg">
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
        </div>
        {selectedBenchmark ? (
          <div className="mt-3">
            <span className="inline-flex items-center gap-2 border border-accent bg-background px-3 py-2 text-sm">
              <span>
                {selectedBenchmark.name} ·{" "}
                <span className="font-mono text-xs">
                  {selectedBenchmark.code}
                </span>
              </span>
              <button
                type="button"
                aria-label={`移除模拟组合指数 ${selectedBenchmark.name}`}
                onClick={() => setBenchmarkId("")}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </span>
          </div>
        ) : null}
        <div className="relative mt-5">
          <label className="grid gap-1 text-xs text-muted-foreground">
            搜索研究库基金
            <input
              aria-label="搜索研究库基金"
              value={fundQuery}
              onChange={(event) => setFundQuery(event.target.value)}
              placeholder="输入基金名称或代码"
              autoComplete="off"
              className="border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </label>
          {fundQuery.trim() ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-border bg-card shadow-lg">
              {matchedFunds.map((fund) => (
                <button
                  type="button"
                  key={fund.id}
                  onClick={() => addFund(fund.id)}
                  className="grid w-full grid-cols-[1fr_auto] gap-3 border-b border-border px-3 py-3 text-left text-sm last:border-0 hover:bg-background"
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
        </div>
        <div className="mt-4 divide-y divide-border border-y border-border">
          {selectedFunds.map((fund) => (
            <div
              key={fund.id}
              className="grid grid-cols-[1fr_6rem_auto] items-center gap-3 py-3 text-sm"
            >
              <span>
                {fund.name}
                <small className="ml-2 font-mono text-muted-foreground">
                  {fund.code}
                </small>
              </span>
              <span className="flex items-center gap-1">
                <input
                  aria-label={`${fund.name}权重`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={weights[fund.id] ?? ""}
                  onChange={(event) =>
                    setWeights((current) => ({
                      ...current,
                      [fund.id]: event.target.value,
                    }))
                  }
                  className="w-full border border-border bg-background px-2 py-1.5 text-right"
                />
                %
              </span>
              <button
                type="button"
                onClick={() => removeFund(fund.id)}
                className="px-2 py-1 text-xs text-muted-foreground hover:text-red-700"
              >
                移除
              </button>
            </div>
          ))}
          {!selectedFunds.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              先搜索并添加研究库基金，不会一次展示全部标的。
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p
            className={
              totalWeight > 100
                ? "text-sm text-red-700"
                : "text-sm text-muted-foreground"
            }
          >
            合计 {totalWeight.toFixed(1)}% · 现金{" "}
            {Math.max(0, 100 - totalWeight).toFixed(1)}%
          </p>
          <button
            disabled={isPending || totalWeight <= 0 || totalWeight > 100}
            className="bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            保存组合
          </button>
        </div>
        {message ? (
          <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
            {message}
          </p>
        ) : null}
      </form>
    <section
      id="portfolio-backtests"
      className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6"
    >
        <h2 className="text-2xl font-semibold">历史检验</h2>
        <div className="mt-5 divide-y divide-border border-y border-border">
          {portfolios.map((portfolio) => (
            <article
              key={portfolio.id}
              className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <p className="font-semibold">{portfolio.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {portfolio.startDate} · {portfolio.rebalanceFrequency} ·{" "}
                  {portfolio.allocations
                    .map(
                      (item) =>
                        `${item.name} ${(item.targetWeight * 100).toFixed(0)}%`,
                    )
                    .join(" / ")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => backtest(portfolio.id)}
                  disabled={isPending}
                  className="border border-accent px-3 py-2 text-xs text-accent"
                >
                  运行回测
                </button>
                <button
                  onClick={() => remove(portfolio.id)}
                  disabled={isPending}
                  className="px-2 py-2 text-xs text-muted-foreground hover:text-red-700"
                >
                  删除
                </button>
              </div>
            </article>
          ))}
          {!portfolios.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              先在左侧创建第一个模拟组合。
            </p>
          ) : null}
        </div>
        {result ? (
          <div className="mt-6">
            <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
              {[
                ["累计收益", percent(result.metrics.totalReturn)],
                ["年化收益", percent(result.metrics.annualizedReturn)],
                ["最大回撤", percent(result.metrics.maxDrawdown)],
                ["夏普", result.metrics.sharpe?.toFixed(2) ?? "--"],
                ["波动率", percent(result.metrics.volatility)],
                ["Sortino", result.metrics.sortino?.toFixed(2) ?? "--"],
                ["Calmar", result.metrics.calmar?.toFixed(2) ?? "--"],
                ["换手率", percent(result.turnover)],
              ].map(([label, value]) => (
                <div key={label} className="bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="mt-1 font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <svg
              viewBox="0 0 760 200"
              role="img"
              aria-label="模拟组合累计净值曲线"
              className="mt-5 w-full border border-border bg-background p-3"
            >
              <path
                d={chartPath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <p className="mt-2 text-xs text-muted-foreground">
              实际共同起点 {result.actualStartDate} · 无风险利率 0 ·{" "}
              {result.benchmark
                ? `相对 ${result.benchmark.name} 超额 ${percent(result.benchmark.excessTotalReturn)}`
                : "未选择比较指数"}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

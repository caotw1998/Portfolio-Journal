"use client";

import type { EChartsOption } from "echarts";
import { useMemo, useState } from "react";
import { ThemedEChart } from "@/components/charts/themed-echart";
import { buildBenchmarkConstituentPresentation } from "@/lib/domain/benchmark-constituents";
import { returnToneClass } from "@/lib/visual-tones";

export type BenchmarkConstituentSnapshotView = {
  id: string;
  effectiveDate: string;
  coverage: string;
  totalWeightPercent: number | null;
  source: string;
  sourceUrl: string | null;
  constituents: Array<{
    rank: number;
    code: string;
    name: string;
    exchange: string | null;
    industry: string | null;
    weightPercent: number | null;
  }>;
};

export function BenchmarkConstituentHistory({ snapshots, lastSyncError }: {
  snapshots: BenchmarkConstituentSnapshotView[];
  lastSyncError: string | null;
}) {
  const [snapshotId, setSnapshotId] = useState(snapshots[0]?.id ?? "");
  const snapshotIndex = snapshots.findIndex((item) => item.id === snapshotId);
  const snapshot = snapshotIndex >= 0 ? snapshots[snapshotIndex] : snapshots[0];
  const previousSnapshot = snapshotIndex >= 0 ? snapshots[snapshotIndex + 1] : snapshots[1];
  const presentation = useMemo(() => buildBenchmarkConstituentPresentation(
    snapshot?.constituents ?? [],
    previousSnapshot?.constituents ?? [],
    Boolean(previousSnapshot),
  ), [previousSnapshot, snapshot]);
  const industryChartOption = useMemo<EChartsOption>(() => ({
    animation: false,
    color: ["#2f5d50", "#c98352", "#b7791f", "#8f6d58", "#6f8f7c", "#9c6f44", "#637c72", "#d2a679"],
    tooltip: {
      trigger: "item",
      formatter: (parameters) => {
        const item = Array.isArray(parameters) ? parameters[0] : parameters;
        return `${String(item?.name ?? "")} ${Number(item?.value).toFixed(2)}%`;
      },
    },
    legend: {
      type: "plain",
      bottom: 0,
      left: "center",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: "#5e675d", fontSize: 11 },
      formatter: (name: string) => {
        const item = presentation.industries.find((industry) => industry.name === name);
        return item ? `${name} ${item.weight.toFixed(2)}%` : name;
      },
    },
    series: [{
      name: "行业配置",
      type: "pie",
      radius: ["43%", "68%"],
      center: ["50%", "40%"],
      avoidLabelOverlap: true,
      label: { show: false },
      emphasis: { scale: false },
      data: presentation.industries.map((industry) => ({ name: industry.name, value: industry.weight })),
    }],
  }), [presentation.industries]);

  if (!snapshot) {
    return <section className="min-w-0 border border-border bg-card p-5 text-sm text-muted-foreground lg:p-6" aria-labelledby="benchmark-constituents-title"><h2 id="benchmark-constituents-title" className="text-xl font-semibold text-foreground lg:text-2xl">指数成分股</h2><div className="mt-4 flex min-h-48 items-center justify-center border border-dashed border-border bg-background px-6 text-center leading-6">尚无成分股快照。同步指数可获取中证最新前十大，完整历史可通过 CSV 导入。{lastSyncError ? ` 最近同步：${lastSyncError}` : ""}</div></section>;
  }

  const coverageLabel = snapshot.coverage === "full" ? `完整名单 · ${snapshot.constituents.length} 只` : `官方前十大 · ${snapshot.constituents.length} 只`;
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[1.25fr_0.75fr] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[1.25fr_0.75fr]" aria-labelledby="benchmark-constituents-title">
      <section className="min-w-0 border border-border bg-card p-3 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">成分与权重</p><h2 id="benchmark-constituents-title" className="mt-1 text-xl font-semibold lg:text-2xl">指数成分股</h2></div>
          {snapshots.length > 1 ? <label className="grid gap-1 text-xs text-muted-foreground">快照日期<select aria-label="成分股快照日期" value={snapshot.id} onChange={(event) => setSnapshotId(event.target.value)} className="border border-border bg-background px-3 py-2 text-sm text-foreground">{snapshots.map((item) => <option key={item.id} value={item.id}>{item.effectiveDate}</option>)}</select></label> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="border border-border bg-background px-2.5 py-1.5">{snapshot.effectiveDate}</span>
          <span className="border border-border bg-background px-2.5 py-1.5">{coverageLabel}</span>
          {snapshot.totalWeightPercent !== null ? <span className="border border-border bg-background px-2.5 py-1.5">合计 {snapshot.totalWeightPercent.toFixed(2)}%</span> : null}
        </div>
        <div className="mt-3 min-w-0 border-y border-border" data-testid="compact-benchmark-constituents-table">
          <table className="w-full table-fixed border-collapse text-xs">
            <colgroup><col className="w-[38%]" /><col className="w-[16%]" /><col className="w-[20%]" /><col className="w-[26%]" /></colgroup>
            <thead><tr className="border-b border-border text-[10px] text-muted-foreground"><th scope="col" className="px-1 py-1.5 text-left font-normal sm:px-2 sm:py-2">标的</th><th scope="col" className="px-1 py-1.5 text-right font-normal sm:px-2 sm:py-2">占比</th><th scope="col" className="px-1 py-1.5 text-right font-normal sm:px-2 sm:py-2">较上期</th><th scope="col" className="px-2 py-1.5 text-left font-normal sm:px-3 sm:py-2">行业</th></tr></thead>
            <tbody className="divide-y divide-border">
              {presentation.rows.map((constituent) => (
                <tr key={constituent.code}>
                  <td className="min-w-0 px-1 py-1.5 align-middle sm:px-2 sm:py-2"><p className="truncate font-medium">{constituent.name}</p><p className="truncate font-mono text-[10px] leading-3 text-muted-foreground">#{constituent.rank} · {constituent.code}</p><p className="truncate text-[9px] leading-3 text-muted-foreground">{constituent.exchange ?? "交易所未披露"}</p></td>
                  <td className="px-1 py-1.5 text-right align-middle font-mono text-[11px] sm:px-2 sm:py-2">{constituent.weight === null ? "" : `${constituent.weight.toFixed(2)}%`}</td>
                  <td className={`px-1 py-1.5 text-right align-middle font-mono text-[11px] sm:px-2 sm:py-2 ${constituent.changeKind === "new" ? "text-[#c94735]" : returnToneClass(constituent.change)}`}>{constituent.changeKind === "new" ? "新进" : constituent.change === null ? "" : `${constituent.change > 0 ? "+" : ""}${constituent.change.toFixed(2)}%`}</td>
                  <td className="px-2 py-1.5 text-left align-middle text-[11px] leading-4 text-muted-foreground sm:px-3 sm:py-2">{constituent.industry ?? "暂未获取"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">行业采用数据源披露的一级行业分类。</p>
        {previousSnapshot ? <p className="mt-1 text-[11px] text-muted-foreground">较上期：{previousSnapshot.effectiveDate} · 成分权重变化（%）</p> : <p className="mt-1 text-[11px] text-muted-foreground">暂无更早快照用于计算权重变化。</p>}
        <p className="mt-3 border-l-2 border-[var(--warm-highlight)] pl-3 text-xs leading-5 text-muted-foreground">{snapshot.coverage === "top10" ? "中证免费接口自动同步最新前十大；完整名单与历史权重可通过 CSV 导入。" : "该快照来自历史 CSV 导入。"} 来源：{snapshot.sourceUrl ? <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{snapshot.source}</a> : snapshot.source}</p>
      </section>
      <section className="min-w-0 border border-border bg-card p-5">
        <p className="font-mono text-xs text-muted-foreground">{snapshot.effectiveDate}</p>
        <h2 className="mt-1 text-2xl font-semibold">行业配置</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">{snapshot.coverage === "top10" ? "前十大成分行业配置，不代表完整指数行业分布。" : "按该完整成分股快照汇总。"}</p>
        {presentation.industries.length ? <div data-testid="benchmark-industry-allocation-chart" className="mt-2 min-w-0"><ThemedEChart option={industryChartOption} height={300} /></div> : <div data-testid="benchmark-industry-allocation-empty" className="mt-5 flex min-h-48 items-center justify-center border border-dashed border-border bg-background px-5 text-center text-sm text-muted-foreground">该快照暂缺可用于汇总的行业和权重数据。</div>}
      </section>
    </div>
  );
}

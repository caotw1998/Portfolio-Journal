"use client";

import { useMemo, useState } from "react";

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
  const snapshot = useMemo(() => snapshots.find((item) => item.id === snapshotId) ?? snapshots[0], [snapshotId, snapshots]);

  return (
    <section className="min-w-0 overflow-hidden border border-border bg-card p-4 lg:p-6" aria-labelledby="benchmark-constituents-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">成分与权重</p><h2 id="benchmark-constituents-title" className="mt-1 text-xl font-semibold lg:text-2xl">指数成分股</h2></div>
        {snapshots.length > 1 ? <label className="grid gap-1 text-xs text-muted-foreground">快照日期<select aria-label="成分股快照日期" value={snapshot?.id ?? ""} onChange={(event) => setSnapshotId(event.target.value)} className="h-9 border border-border bg-background px-2 text-sm text-foreground">{snapshots.map((item) => <option key={item.id} value={item.id}>{item.effectiveDate}</option>)}</select></label> : null}
      </div>
      {snapshot ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="border border-border bg-background px-2.5 py-1.5">{snapshot.effectiveDate}</span>
            <span className="border border-border bg-background px-2.5 py-1.5">{snapshot.coverage === "full" ? `完整名单 · ${snapshot.constituents.length} 只` : `官方前十大 · ${snapshot.constituents.length} 只`}</span>
            {snapshot.totalWeightPercent !== null ? <span className="border border-border bg-background px-2.5 py-1.5">合计 {snapshot.totalWeightPercent.toFixed(2)}%</span> : null}
          </div>
          <div className="mt-3 overflow-x-auto border border-border">
            <table className="w-full min-w-[38rem] border-collapse text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">排名</th><th className="px-3 py-2">代码 / 名称</th><th className="px-3 py-2">行业</th><th className="px-3 py-2">交易所</th><th className="px-3 py-2 text-right">权重</th></tr></thead>
              <tbody>{snapshot.constituents.map((item) => <tr key={item.code} className="border-t border-border"><td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.rank}</td><td className="px-3 py-2"><span className="font-medium">{item.name}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{item.code}</span></td><td className="px-3 py-2 text-muted-foreground">{item.industry ?? "--"}</td><td className="px-3 py-2 text-muted-foreground">{item.exchange ?? "--"}</td><td className="px-3 py-2 text-right font-semibold">{item.weightPercent === null ? "--" : `${item.weightPercent.toFixed(2)}%`}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 border-l-2 border-[var(--warm-highlight)] pl-3 text-xs leading-5 text-muted-foreground">{snapshot.coverage === "top10" ? "中证免费接口自动同步最新前十大；完整名单与历史权重可通过 CSV 导入。" : "该快照来自历史 CSV 导入。"} 来源：{snapshot.sourceUrl ? <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{snapshot.source}</a> : snapshot.source}</p>
        </>
      ) : <div className="mt-4 flex min-h-48 items-center justify-center border border-dashed border-border bg-background px-6 text-center text-sm leading-6 text-muted-foreground">尚无成分股快照。同步指数可获取中证最新前十大，完整历史可通过 CSV 导入。{lastSyncError ? ` 最近同步：${lastSyncError}` : ""}</div>}
    </section>
  );
}

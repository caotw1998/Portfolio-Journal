"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { resolveLatestDisclosedSnapshot } from "@/lib/funds/capital-history";

type Holding = {
  id: string;
  kind: string;
  rank: number;
  code: string | null;
  name: string;
  weight: number | null;
  quantity: number | null;
  marketValue: number | null;
};

type PortfolioReport = {
  id: string;
  reportDate: string;
  stockPercent: number | null;
  bondPercent: number | null;
  cashPercent: number | null;
  otherPercent: number | null;
  holdings: Holding[];
};

function percent(value: number | null) {
  return value === null ? "公开来源未披露" : `${value.toFixed(2)}%`;
}

type ScaleSnapshot = {
  reportDate: string;
  netAssets: number | null;
  shares: number | null;
};

type FlowSnapshot = {
  reportDate: string;
  subscriptions: number | null;
  redemptions: number | null;
  totalShares: number | null;
};

type HolderSnapshot = {
  reportDate: string;
  institutionPercent: number | null;
  individualPercent: number | null;
  internalPercent: number | null;
};

function reportDate(value: string) {
  return value.slice(0, 10);
}

function capitalValue(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) return "公开来源未披露";
  return unit === "%" ? `${value.toFixed(2)}%` : `${value.toFixed(2)} ${unit}`;
}

export function FundCapitalHistory({
  scaleSnapshots,
  flowSnapshots,
  holderSnapshots,
}: {
  scaleSnapshots: ScaleSnapshot[];
  flowSnapshots: FlowSnapshot[];
  holderSnapshots: HolderSnapshot[];
}) {
  const reportDates = useMemo(() => Array.from(new Set([
    ...scaleSnapshots.map((point) => reportDate(point.reportDate)),
    ...flowSnapshots.map((point) => reportDate(point.reportDate)),
    ...holderSnapshots.map((point) => reportDate(point.reportDate)),
  ])).sort((left, right) => right.localeCompare(left)), [flowSnapshots, holderSnapshots, scaleSnapshots]);
  const [selectedDate, setSelectedDate] = useState(reportDates[0] ?? "");
  const scale = scaleSnapshots.find((point) => reportDate(point.reportDate) === selectedDate);
  const flow = flowSnapshots.find((point) => reportDate(point.reportDate) === selectedDate);
  const holders = resolveLatestDisclosedSnapshot(
    holderSnapshots.map((point) => ({ ...point, reportDate: reportDate(point.reportDate) })),
    selectedDate,
  );
  const netSubscriptions = flow?.subscriptions !== null && flow?.subscriptions !== undefined
    && flow.redemptions !== null && flow.redemptions !== undefined
    ? flow.subscriptions - flow.redemptions
    : null;

  if (!reportDates.length) {
    return <section id="capital" className="scroll-mt-20 border border-border bg-card p-5 text-sm text-muted-foreground lg:scroll-mt-6">公开来源暂未披露规模与资金结构。</section>;
  }

  const values = [
    ["净资产规模", capitalValue(scale?.netAssets, "亿元")],
    ["总份额", capitalValue(flow?.totalShares ?? scale?.shares, "亿份")],
    ["期间申购", capitalValue(flow?.subscriptions, "亿份")],
    ["期间赎回", capitalValue(flow?.redemptions, "亿份")],
    ["期间净申购", capitalValue(netSubscriptions, "亿份")],
    ["机构持有", capitalValue(holders?.institutionPercent, "%"), holders?.reportDate],
    ["散户持有比例（个人投资者）", capitalValue(holders?.individualPercent, "%"), holders?.reportDate],
    ["内部持有", capitalValue(holders?.internalPercent, "%"), holders?.reportDate],
  ];

  return (
    <section id="capital" className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Scale / Flow / Holders</p>
          <h2 className="mt-1 text-2xl font-semibold">规模与资金结构</h2>
          <p className="mt-2 text-sm text-muted-foreground">规模与申赎对应所选报告期；持有人结构显示不晚于该日期的最近披露值。</p>
        </div>
        <label className="grid gap-1 text-xs text-muted-foreground">
          报告期
          <select aria-label="规模与资金结构报告期" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="border border-border bg-background px-3 py-2 text-sm text-foreground">
            {reportDates.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-5 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {values.map(([label, value, disclosedAt]) => <div key={label} className="bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p>{disclosedAt ? <p className="mt-1 text-[11px] text-muted-foreground">截至 {disclosedAt}</p> : null}</div>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className={scale ? "border border-emerald-700/30 bg-emerald-700/5 px-2 py-1" : "border border-border px-2 py-1"}>{scale ? "规模已披露" : "该报告期未披露规模"}</span>
        <span className={flow ? "border border-emerald-700/30 bg-emerald-700/5 px-2 py-1" : "border border-border px-2 py-1"}>{flow ? "申赎已披露" : "该报告期未披露申赎"}</span>
        <span className={holders ? "border border-emerald-700/30 bg-emerald-700/5 px-2 py-1" : "border border-border px-2 py-1"}>{holders ? holders.reportDate === selectedDate ? "持有人结构已披露" : `持有人结构最近披露期 ${holders.reportDate}` : "截至该报告期公开来源未披露持有人结构"}</span>
      </div>
    </section>
  );
}

export function FundPortfolioHistory({ reports, selectedReport, fundId }: { reports: Omit<PortfolioReport, "holdings">[]; selectedReport: PortfolioReport | null; fundId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"stock" | "bond">("stock");
  const report = selectedReport;
  const holdings = useMemo(
    () => report?.holdings.filter((holding) => holding.kind === kind) ?? [],
    [kind, report],
  );

  if (!report) {
    return <section id="portfolio" className="scroll-mt-20 border border-border bg-card p-5 text-sm text-muted-foreground lg:scroll-mt-6">公开来源暂未披露持仓报告。</section>;
  }

  return (
    <div id="portfolio" className="grid min-w-0 scroll-mt-20 gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:scroll-mt-6">
      <section className="min-w-0 border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Portfolio · Disclosure</p>
            <h2 className="mt-1 text-2xl font-semibold">公开持仓</h2>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            报告期
            <select aria-label="持仓报告期" value={report.id} onChange={(event) => router.replace(`/funds/${fundId}?report=${event.target.value}#portfolio`, { scroll: false })} className="border border-border bg-background px-3 py-2 text-sm text-foreground">
              {reports.map((item) => <option key={item.id} value={item.id}>{item.reportDate.slice(0, 10)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex gap-2" aria-label="持仓类型">
          {([['stock', '股票'], ['bond', '债券']] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setKind(value)} className={kind === value ? "border border-accent bg-accent px-4 py-2 text-xs text-accent-foreground" : "border border-border bg-background px-4 py-2 text-xs text-muted-foreground"}>{label}</button>
          ))}
        </div>
        <div className="mt-4 max-w-full overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3">排名</th><th>标的</th><th>代码</th><th className="text-right">占比</th><th className="text-right">数量（万）</th><th className="text-right">市值（万元）</th></tr></thead>
            <tbody className="divide-y divide-border">
              {holdings.map((holding) => <tr key={holding.id}><td className="py-3 font-mono text-xs">{holding.rank}</td><td>{holding.name}</td><td className="font-mono text-xs text-muted-foreground">{holding.code ?? "未披露"}</td><td className="text-right">{percent(holding.weight)}</td><td className="text-right">{holding.quantity?.toLocaleString("zh-CN") ?? "未披露"}</td><td className="text-right">{holding.marketValue?.toLocaleString("zh-CN") ?? "未披露"}</td></tr>)}
            </tbody>
          </table>
          {!holdings.length ? <p className="py-5 text-sm text-muted-foreground">该报告期未公开披露{kind === "stock" ? "股票" : "债券"}持仓。</p> : null}
        </div>
      </section>
      <section className="min-w-0 border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Allocation · {report.reportDate.slice(0, 10)}</p>
        <h2 className="mt-1 text-2xl font-semibold">资产配置</h2>
        <div className="mt-5 grid grid-cols-2 gap-px bg-border text-sm">
          {[["股票", report.stockPercent], ["债券", report.bondPercent], ["现金", report.cashPercent], ["其他", report.otherPercent]].map(([label, value]) => <div key={String(label)} className="bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{percent(value as number | null)}</p></div>)}
        </div>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">持仓仅代表该报告期依法公开披露的范围，不代表实时仓位。</p>
      </section>
    </div>
  );
}

export function FundSyncButton({ fundId }: { fundId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function sync() {
    setMessage("正在同步完整历史资料，首次回填可能需要较长时间……");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/funds/${fundId}/sync?force=true`, { method: "POST" });
        const body = await response.json() as { error?: string; data?: { latestSyncError?: string | null } };
        if (!response.ok) throw new Error(body.error ?? "同步失败。");
        setMessage(body.data?.latestSyncError
          ? `同步完成，但部分分区失败：${body.data.latestSyncError}`
          : "完整资料同步完成。");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "同步失败。");
      }
    });
  }

  return <div className="text-right"><button type="button" onClick={sync} disabled={isPending} className="border border-border bg-background px-4 py-2 text-xs font-medium disabled:opacity-50">{isPending ? "同步中…" : "重新同步全部资料"}</button>{message ? <p className="mt-2 max-w-xs text-xs text-muted-foreground" aria-live="polite">{message}</p> : null}</div>;
}

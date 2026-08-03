"use client";

import type { EChartsOption } from "echarts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ThemedEChart } from "@/components/charts/themed-echart";
import { buildCapitalHistoryPeriods, selectCapitalHistoryPage } from "@/lib/funds/capital-history";
import { buildIndustryAllocations, buildPortfolioHoldingRows, buildTopTenIndustryAllocations } from "@/lib/funds/portfolio-view";
import { returnToneClass } from "@/lib/visual-tones";

type Holding = {
  id: string;
  kind: string;
  rank: number;
  code: string | null;
  name: string;
  weight: number | null;
  quantity: number | null;
  marketValue: number | null;
  industry?: string | null;
  industrySource?: string | null;
};

type PortfolioReport = {
  id: string;
  reportDate: string;
  stockPercent: number | null;
  bondPercent: number | null;
  cashPercent: number | null;
  otherPercent: number | null;
  industryJson?: unknown;
  holdings: Holding[];
  previousReportDate?: string | null;
  previousHoldings?: Holding[];
};

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

export function FundCapitalHistory({
  scaleSnapshots,
  flowSnapshots,
  holderSnapshots,
}: {
  scaleSnapshots: ScaleSnapshot[];
  flowSnapshots: FlowSnapshot[];
  holderSnapshots: HolderSnapshot[];
}) {
  const [capitalPageIndex, setCapitalPageIndex] = useState(0);
  const allPeriods = useMemo(() => buildCapitalHistoryPeriods({
    scaleSnapshots,
    flowSnapshots,
    holderSnapshots,
  }), [flowSnapshots, holderSnapshots, scaleSnapshots]);
  const pageCount = Math.ceil(allPeriods.length / 3);
  const periods = useMemo(
    () => selectCapitalHistoryPage(allPeriods, capitalPageIndex),
    [allPeriods, capitalPageIndex],
  );
  const dates = periods.map((period) => period.reportDate);
  const scaleChartOption = useMemo<EChartsOption>(() => ({
    animation: false,
    color: ["#2f5d50", "#c98352"],
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, itemWidth: 11, itemHeight: 8, textStyle: { color: "#5e675d", fontSize: 10 } },
    grid: { top: 20, right: 42, bottom: 64, left: 42 },
    xAxis: { type: "category", data: dates, axisLabel: { color: "#5e675d", fontSize: 10, formatter: (value: string) => value.slice(2) } },
    yAxis: [
      { type: "value", name: "亿元", nameTextStyle: { color: "#5e675d" }, axisLabel: { color: "#5e675d", fontSize: 9 } },
      { type: "value", name: "亿份", nameTextStyle: { color: "#5e675d" }, axisLabel: { color: "#5e675d", fontSize: 9 }, splitLine: { show: false } },
    ],
    series: [
      { name: "净资产规模（亿元）", type: "bar", barMaxWidth: 22, data: periods.map((period) => period.netAssets), tooltip: { valueFormatter: (value) => `${Number(value).toFixed(2)} 亿元` } },
      { name: "总份额（亿份）", type: "bar", yAxisIndex: 1, barMaxWidth: 22, data: periods.map((period) => period.totalShares), tooltip: { valueFormatter: (value) => `${Number(value).toFixed(2)} 亿份` } },
    ],
  }), [dates, periods]);
  const flowChartOption = useMemo<EChartsOption>(() => ({
    animation: false,
    color: ["#2f5d50", "#c98352", "#b42318"],
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, itemWidth: 11, itemHeight: 8, textStyle: { color: "#5e675d", fontSize: 10 } },
    grid: { top: 20, right: 18, bottom: 64, left: 44 },
    xAxis: { type: "category", data: dates, axisLabel: { color: "#5e675d", fontSize: 10, formatter: (value: string) => value.slice(2) } },
    yAxis: { type: "value", name: "亿份", nameTextStyle: { color: "#5e675d" }, min: (value: { min: number }) => Math.min(0, value.min), max: (value: { max: number }) => Math.max(0, value.max), axisLine: { show: true, onZero: true }, axisLabel: { color: "#5e675d", fontSize: 9 } },
    series: [
      { name: "期间申购", type: "bar", barMaxWidth: 18, data: periods.map((period) => period.subscriptions), tooltip: { valueFormatter: (value) => `${Number(value).toFixed(2)} 亿份` } },
      { name: "期间赎回", type: "bar", barMaxWidth: 18, data: periods.map((period) => period.redemptions), tooltip: { valueFormatter: (value) => `${Number(value).toFixed(2)} 亿份` } },
      { name: "期间净申购", type: "bar", barMaxWidth: 18, data: periods.map((period) => period.netSubscriptions), tooltip: { valueFormatter: (value) => `${Number(value).toFixed(2)} 亿份` } },
    ],
  }), [dates, periods]);
  const holderChartOption = useMemo<EChartsOption>(() => ({
    animation: false,
    color: ["#2f5d50", "#c98352", "#b7791f"],
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { bottom: 0, itemWidth: 11, itemHeight: 8, textStyle: { color: "#5e675d", fontSize: 10 } },
    grid: { top: 20, right: 18, bottom: 64, left: 42 },
    xAxis: { type: "category", data: dates, axisLabel: { color: "#5e675d", fontSize: 10, formatter: (value: string) => value.slice(2) } },
    yAxis: { type: "value", min: 0, max: 100, axisLabel: { color: "#5e675d", fontSize: 9, formatter: "{value}%" } },
    series: [
      { name: "机构", type: "bar", stack: "holders", barMaxWidth: 42, data: periods.map((period) => period.holderStack?.institution ?? null), tooltip: { valueFormatter: (value) => `${Number(value).toFixed(2)}%` } },
      { name: "个人", type: "bar", stack: "holders", barMaxWidth: 42, data: periods.map((period) => period.holderStack?.individual ?? null), tooltip: { valueFormatter: (value) => `${Number(value).toFixed(2)}%` } },
      { name: "内部持有", type: "bar", stack: "holders", barMaxWidth: 42, data: periods.map((period) => period.holderStack?.internal ?? null), tooltip: { valueFormatter: (value) => `${Number(value).toFixed(2)}%` } },
    ],
  }), [dates, periods]);

  if (!allPeriods.length) {
    return <section id="capital" className="scroll-mt-20 border border-border bg-card p-5 text-sm text-muted-foreground lg:scroll-mt-6">公开来源暂未披露规模与资金结构。</section>;
  }

  return (
    <section id="capital" className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6 lg:p-6">
      <div>
        <h2 className="mt-1 text-2xl font-semibold">规模与资金结构</h2>
        {pageCount > 1 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="规模资金报告期翻页">
            <button type="button" onClick={() => setCapitalPageIndex((current) => Math.min(current + 1, pageCount - 1))} disabled={capitalPageIndex >= pageCount - 1} className="min-h-10 border border-border bg-background px-3 py-2 text-xs text-muted-foreground disabled:opacity-40">较早三期</button>
            <button type="button" onClick={() => setCapitalPageIndex((current) => Math.max(current - 1, 0))} disabled={capitalPageIndex === 0} className="min-h-10 border border-border bg-background px-3 py-2 text-xs text-muted-foreground disabled:opacity-40">较新三期</button>
            <span className="font-mono text-[11px] text-muted-foreground">第 {capitalPageIndex + 1} / {pageCount} 组 · {periods[0]?.reportDate} 至 {periods.at(-1)?.reportDate}</span>
          </div>
        ) : null}
      </div>
      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-3 layout-mobile:grid-cols-1 layout-desktop:grid-cols-3">
        <section data-testid="capital-scale-chart" className="min-w-0 border border-border bg-background p-3"><h3 className="text-sm font-semibold">规模</h3><p className="mt-1 text-[11px] text-muted-foreground">净资产规模（亿元） · 总份额（亿份）</p><ThemedEChart option={scaleChartOption} height={270} /></section>
        <section data-testid="capital-flow-chart" className="min-w-0 border border-border bg-background p-3"><h3 className="text-sm font-semibold">申赎</h3><p className="mt-1 text-[11px] text-muted-foreground">申购、赎回与净申购（亿份）</p><ThemedEChart option={flowChartOption} height={270} /></section>
        <section data-testid="capital-holder-chart" className="min-w-0 border border-border bg-background p-3"><h3 className="text-sm font-semibold">持有人结构</h3><p className="mt-1 text-[11px] text-muted-foreground">归一化为 100% 堆叠；精确值可在图中查看</p><ThemedEChart option={holderChartOption} height={270} /></section>
      </div>
    </section>
  );
}

export function FundPortfolioHistory({ reports, selectedReport, fundId }: { reports: Omit<PortfolioReport, "holdings">[]; selectedReport: PortfolioReport | null; fundId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"stock" | "bond">("stock");
  const [industryByCode, setIndustryByCode] = useState<Record<string, { industry: string | null; source: string | null }>>({});
  const [industryMessage, setIndustryMessage] = useState<string | null>(null);
  const report = selectedReport;
  const holdingRows = useMemo(
    () => buildPortfolioHoldingRows(
      report?.holdings.filter((holding) => holding.kind === kind) ?? [],
      report?.previousHoldings?.filter((holding) => holding.kind === kind) ?? [],
      Boolean(report?.previousReportDate),
    ),
    [kind, report],
  );
  const industries = useMemo(() => buildTopTenIndustryAllocations(
    report?.holdings
      .filter((holding) => holding.kind === "stock")
      .map((holding) => ({
        rank: holding.rank,
        weight: holding.weight,
        industry: holding.industry ?? (holding.code ? industryByCode[holding.code]?.industry : null),
      })) ?? [],
  ), [industryByCode, report]);

  useEffect(() => {
    const missingCodes = report?.holdings.flatMap((holding) => holding.kind === "stock" && holding.code && !holding.industry ? [holding.code] : []) ?? [];
    if (!report || !missingCodes.length) return;
    const controller = new AbortController();
    void fetch(`/api/funds/${fundId}/portfolio/${report.id}/industries`, { method: "POST", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: Array<{ code: string; industry: string | null; source: string | null }>; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "持仓行业补全失败。");
        setIndustryByCode((current) => ({
          ...current,
          ...Object.fromEntries((payload.data ?? []).map((item) => [item.code, { industry: item.industry, source: item.source }])),
        }));
        setIndustryMessage((payload.data ?? []).some((item) => item.industry) ? "持仓行业已更新。" : "公开来源暂未返回这些持仓的行业。" );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setIndustryMessage(error instanceof Error ? error.message : "持仓行业补全失败。");
      });
    return () => controller.abort();
  }, [fundId, report]);
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
        const item = industries.find((industry) => industry.name === name);
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
      data: industries.map((industry) => ({ name: industry.name, value: industry.weight })),
    }],
  }), [industries]);

  if (!report) {
    return <section id="portfolio" className="scroll-mt-20 border border-border bg-card p-5 text-sm text-muted-foreground lg:scroll-mt-6">公开来源暂未披露持仓报告。</section>;
  }

  return (
    <div id="portfolio" className="grid min-w-0 scroll-mt-20 gap-5 lg:grid-cols-[1.25fr_0.75fr] lg:scroll-mt-6 layout-mobile:grid-cols-1 layout-desktop:grid-cols-[1.25fr_0.75fr]">
      <section className="min-w-0 border border-border bg-card p-3 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
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
        <div className="mt-3 min-w-0 border-y border-border" data-testid="compact-holdings-table">
          <table className="w-full table-fixed border-collapse text-xs">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[26%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-[10px] text-muted-foreground">
                <th scope="col" className="px-1 py-1.5 text-left font-normal sm:px-2 sm:py-2">标的</th>
                <th scope="col" className="px-1 py-1.5 text-right font-normal sm:px-2 sm:py-2">占比</th>
                <th scope="col" className="px-1 py-1.5 text-right font-normal sm:px-2 sm:py-2">较上期</th>
                <th scope="col" className="px-2 py-1.5 text-left font-normal sm:px-3 sm:py-2">行业</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
            {holdingRows.map((holding) => (
              <tr key={holding.id}>
                <td className="min-w-0 px-1 py-1.5 align-middle sm:px-2 sm:py-2"><p className="truncate font-medium">{holding.name}</p><p className="truncate font-mono text-[10px] leading-3 text-muted-foreground">{holding.code ?? ""}</p></td>
                <td className="px-1 py-1.5 text-right align-middle font-mono text-[11px] sm:px-2 sm:py-2">{holding.weight === null ? "" : `${holding.weight.toFixed(2)}%`}</td>
                <td className={`px-1 py-1.5 text-right align-middle font-mono text-[11px] sm:px-2 sm:py-2 ${holding.changeKind === "new" ? "text-[#c94735]" : returnToneClass(holding.change)}`}>
                  {holding.changeKind === "new" ? "新进" : holding.change === null ? "" : `${holding.change > 0 ? "+" : ""}${holding.change.toFixed(2)}%`}
                </td>
                <td className="px-2 py-1.5 text-left align-middle text-[11px] leading-4 text-muted-foreground sm:px-3 sm:py-2" title={holding.code ? (holding.industrySource ?? industryByCode[holding.code]?.source ?? "公开来源") : undefined}>{kind === "bond" ? "不适用" : holding.industry ?? (holding.code ? industryByCode[holding.code]?.industry : null) ?? "暂未获取"}</td>
              </tr>
            ))}
            {!holdingRows.length ? <tr><td colSpan={4} className="py-5 text-sm text-muted-foreground">该报告期未公开披露{kind === "stock" ? "股票" : "债券"}持仓。</td></tr> : null}
            </tbody>
          </table>
        </div>
        {kind === "stock" ? <p className="mt-2 text-[11px] text-muted-foreground" aria-live="polite">行业采用中证官网一级行业分类。{industryMessage ? ` ${industryMessage}` : ""}</p> : null}
        {report.previousReportDate ? <p className="mt-2 text-[11px] text-muted-foreground">较上期：{report.previousReportDate.slice(0, 10)} · 持仓权重变化（%）</p> : <p className="mt-2 text-[11px] text-muted-foreground">暂无更早报告期用于计算仓位变化。</p>}
      </section>
      <section className="min-w-0 border border-border bg-card p-5">
        <p className="font-mono text-xs text-muted-foreground">{report.reportDate.slice(0, 10)}</p>
        <h2 className="mt-1 text-2xl font-semibold">行业配置</h2>
        {industries.length ? <div data-testid="industry-allocation-chart" className="mt-2 min-w-0"><ThemedEChart option={industryChartOption} height={300} /></div> : <div data-testid="industry-allocation-empty" className="mt-5 flex min-h-48 items-center justify-center border border-dashed border-border bg-background px-5 text-center text-sm text-muted-foreground">前十大持仓暂缺可用的中证行业数据。</div>}
      </section>
    </div>
  );
}

type EtfPcfSnapshot = {
  id: string;
  tradingDay: string;
  components: Array<{
    id: string;
    instrumentCode: string;
    instrumentName: string;
    basketWeight: number | null;
    industry: string | null;
    industrySource: string | null;
  }>;
};

function pcfDate(value: string | null) {
  return value ? value.slice(0, 10) : "未披露";
}

function EtfPcfSnapshotView({ snapshots, selectedSnapshot, fundId }: { snapshots: Array<{ id: string; tradingDay: string }>; selectedSnapshot: EtfPcfSnapshot | null; fundId: string }) {
  const router = useRouter();
  const [enrichedSnapshot, setEnrichedSnapshot] = useState<{ selectedId: string; snapshot: EtfPcfSnapshot } | null>(null);
  const [portfolioStatus, setPortfolioStatus] = useState<{ selectedId: string; message: string | null } | null>(null);
  const snapshot = selectedSnapshot && enrichedSnapshot?.selectedId === selectedSnapshot.id ? enrichedSnapshot.snapshot : selectedSnapshot;
  const portfolioMessage = selectedSnapshot && portfolioStatus?.selectedId === selectedSnapshot.id ? portfolioStatus.message : null;
  const industries = useMemo(() => buildIndustryAllocations(snapshot?.components.map((component) => ({
    weight: component.basketWeight,
    industry: component.industry,
  })) ?? []), [snapshot]);
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
        const item = industries.find((industry) => industry.name === name);
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
      data: industries.map((industry) => ({ name: industry.name, value: industry.weight })),
    }],
  }), [industries]);

  useEffect(() => {
    if (!selectedSnapshot || selectedSnapshot.components.every((component) => component.basketWeight !== null && component.industry)) return;
    const controller = new AbortController();
    void fetch(`/api/funds/${fundId}/pcf/${selectedSnapshot.id}/portfolio`, { method: "POST", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: EtfPcfSnapshot; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "申赎清单补全失败。");
        setEnrichedSnapshot({ selectedId: selectedSnapshot.id, snapshot: payload.data });
        setPortfolioStatus({
          selectedId: selectedSnapshot.id,
          message: payload.data.components.every((component) => component.basketWeight !== null)
            ? null
            : "部分成分缺少参考行情，暂不展示占比。",
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPortfolioStatus({ selectedId: selectedSnapshot.id, message: error instanceof Error ? error.message : "申赎清单补全失败。" });
      });
    return () => controller.abort();
  }, [fundId, selectedSnapshot]);

  if (!snapshot) {
    return <section className="border border-border bg-card p-5 text-sm text-muted-foreground"><h2 className="text-xl font-semibold text-foreground">申购赎回清单</h2><p className="mt-3">官方交易所暂未返回该 ETF 的 PCF 清单。可重新同步后再试，定期报告持仓不会被当作 PCF 替代。</p></section>;
  }
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[1.25fr_0.75fr] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[1.25fr_0.75fr]">
      <section className="min-w-0 border border-border bg-card p-3 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-semibold">申购赎回清单</h2>
          <label className="grid gap-1 text-xs text-muted-foreground">清单日期<select aria-label="PCF 清单日期" value={snapshot.id} onChange={(event) => router.replace(`/funds/${fundId}?pcf=${event.target.value}#portfolio`, { scroll: false })} className="border border-border bg-background px-3 py-2 text-sm text-foreground">{snapshots.map((item) => <option key={item.id} value={item.id}>{pcfDate(item.tradingDay)}</option>)}</select></label>
        </div>
        <div className="mt-3 min-w-0 border-y border-border" data-testid="compact-pcf-holdings-table">
          <table className="w-full table-fixed border-collapse text-xs">
            <colgroup><col className="w-[48%]" /><col className="w-[20%]" /><col className="w-[32%]" /></colgroup>
            <thead><tr className="border-b border-border text-[10px] text-muted-foreground"><th scope="col" className="px-1 py-1.5 text-left font-normal sm:px-2 sm:py-2">公司</th><th scope="col" className="px-1 py-1.5 text-right font-normal sm:px-2 sm:py-2">占比</th><th scope="col" className="px-2 py-1.5 text-left font-normal sm:px-3 sm:py-2">行业</th></tr></thead>
            <tbody className="divide-y divide-border">
              {snapshot.components.map((component) => <tr key={component.id}><td className="min-w-0 px-1 py-1.5 align-middle sm:px-2 sm:py-2"><p className="truncate font-medium">{component.instrumentName}</p><p className="truncate font-mono text-[10px] leading-3 text-muted-foreground">{component.instrumentCode}</p></td><td className="px-1 py-1.5 text-right align-middle font-mono text-[11px] sm:px-2 sm:py-2">{component.basketWeight === null ? "" : `${component.basketWeight.toFixed(2)}%`}</td><td className="px-2 py-1.5 text-left align-middle text-[11px] leading-4 text-muted-foreground sm:px-3 sm:py-2" title={component.industrySource ?? undefined}>{component.industry ?? "暂未获取"}</td></tr>)}
              {!snapshot.components.length ? <tr><td colSpan={3} className="py-5 text-sm text-muted-foreground">该交易日暂无清单成分。</td></tr> : null}
            </tbody>
          </table>
        </div>
        {portfolioMessage ? <p className="mt-2 text-[11px] text-muted-foreground" aria-live="polite">{portfolioMessage}</p> : null}
      </section>
      <section className="min-w-0 border border-border bg-card p-5">
        <p className="font-mono text-xs text-muted-foreground">{pcfDate(snapshot.tradingDay)}</p>
        <h2 className="mt-1 text-2xl font-semibold">行业配置</h2>
        {industries.length ? <div data-testid="pcf-industry-allocation-chart" className="mt-2 min-w-0"><ThemedEChart option={industryChartOption} height={300} /></div> : <div data-testid="pcf-industry-allocation-empty" className="mt-5 flex min-h-48 items-center justify-center border border-dashed border-border bg-background px-5 text-center text-sm text-muted-foreground">清单暂缺完整的占比或行业数据。</div>}
      </section>
    </div>
  );
}

export function EtfPortfolioHistory({ fundId, snapshots, selectedSnapshot, reports, selectedReport }: { fundId: string; snapshots: Array<{ id: string; tradingDay: string }>; selectedSnapshot: EtfPcfSnapshot | null; reports: Omit<PortfolioReport, "holdings">[]; selectedReport: PortfolioReport | null }) {
  const [view, setView] = useState<"pcf" | "report">("pcf");
  return <div id="portfolio" className="grid min-w-0 scroll-mt-20 gap-3 lg:scroll-mt-6"><div className="flex flex-wrap gap-2" role="group" aria-label="ETF 持仓口径"><button type="button" onClick={() => setView("pcf")} className={view === "pcf" ? "border border-accent bg-accent px-4 py-2 text-xs text-accent-foreground" : "border border-border bg-background px-4 py-2 text-xs text-muted-foreground"}>申购赎回清单</button><button type="button" onClick={() => setView("report")} className={view === "report" ? "border border-accent bg-accent px-4 py-2 text-xs text-accent-foreground" : "border border-border bg-background px-4 py-2 text-xs text-muted-foreground"}>定期报告持仓</button></div>{view === "pcf" ? <EtfPcfSnapshotView fundId={fundId} snapshots={snapshots} selectedSnapshot={selectedSnapshot} /> : <FundPortfolioHistory fundId={fundId} reports={reports} selectedReport={selectedReport} />}</div>;
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

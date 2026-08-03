import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EtfPortfolioHistory, FundCapitalHistory, FundPortfolioHistory, FundSyncButton } from "@/components/fund-detail-interactions";
import { DetailPerformanceChart } from "@/components/fund-nav-chart";
import { FundSectionNav } from "@/components/fund-section-nav";
import { ResponsiveDisclosure } from "@/components/responsive-disclosure";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { getEtfPcfSnapshot, getFundDetail, getFundPortfolioReport, listDetailBaselineOptions } from "@/lib/funds/service";

export const dynamic = "force-dynamic";

function date(value: string | Date | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "公开来源未披露";
}

function number(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined ? "公开来源未披露" : value.toFixed(digits);
}

function rate(value: number | null | undefined) {
  return value === null || value === undefined ? "公开来源未披露" : `${(value * 100).toFixed(2)}%`;
}

function ProfileField({ label, children }: { label: string; children: React.ReactNode }) {
  return <><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 leading-6">{children}</dd></>;
}

export default async function FundPage({ params, searchParams }: { params: Promise<{ fundId: string }>; searchParams: Promise<{ report?: string; pcf?: string }> }) {
  const user = await requireWorkspaceUser();
  const { fundId } = await params;
  const { report: reportId, pcf: pcfId } = await searchParams;
  let fund: Awaited<ReturnType<typeof getFundDetail>>;
  try {
    fund = await getFundDetail(user.id, fundId);
  } catch {
    notFound();
  }
  const baselines = await listDetailBaselineOptions(user.id);
  const selectedReport = await getFundPortfolioReport(user.id, fundId, reportId).catch(() => null);
  const selectedPcfSnapshot = fund.vehicleType === "ETF" ? await getEtfPcfSnapshot(user.id, fundId, pcfId) : null;
  const latestNav = fund.navSnapshots.at(-1);
  const dividendsByDate = new Map<string, number>();
  for (const event of fund.dividendEvents) {
    if (!event.exDate || !event.amount) continue;
    const exDate = date(event.exDate);
    dividendsByDate.set(exDate, (dividendsByDate.get(exDate) ?? 0) + event.amount);
  }
  const currentManagers = fund.managerTenures.filter((manager) => manager.endDate === null);
  const historicalManagers = fund.managerTenures.filter((manager) => manager.endDate !== null);

  function sourceCoverage(section: string) {
    if (section === "nav") {
      const first = fund.navSnapshots[0];
      return `${date(first?.valuationDate)} 至 ${date(latestNav?.valuationDate)} · ${fund.navSnapshots.length} 条`;
    }
    if (section === "portfolio") return `${fund.portfolioReports.length} 个报告期`;
    if (section === "managers") return `${fund.managerTenures.length} 条任职记录`;
    if (section === "scale") return `${fund.scaleSnapshots.length} 个规模观测点`;
    if (section === "flows") return `${fund.flowSnapshots.length} 个申赎观测点`;
    if (section === "holders") return `${fund.holderSnapshots.length} 个持有人观测点`;
    if (section === "pcf") return `${fund.etfPcfSnapshots.length} 个申购赎回清单日期`;
    return "核心档案字段";
  }

  return (
    <AppShell currentPath={`/funds/${fund.id}`}>
      <section className="grid gap-5 border border-border bg-card p-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">{fund.code} · {fund.market}</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">{fund.name ?? fund.code}</h1><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="border border-border bg-background px-3 py-1.5">{fund.type}</span><span className="border border-border bg-background px-3 py-1.5">申购 {fund.subscribeStatus ?? "待披露"}</span><span className="border border-border bg-background px-3 py-1.5">赎回 {fund.redeemStatus ?? "待披露"}</span></div></div>
        <div className="grid grid-cols-2 gap-px bg-border"><div className="bg-background p-4"><p className="text-xs text-muted-foreground">最新单位净值</p><p className="mt-2 text-3xl font-semibold">{number(latestNav?.unitNav, 4)}</p></div><div className="bg-background p-4"><p className="text-xs text-muted-foreground">净值日期</p><p className="mt-2 font-mono text-sm">{date(latestNav?.valuationDate)}</p></div><div className="col-span-2 flex flex-wrap items-start justify-between gap-3 bg-background p-4"><div><p className="text-xs text-muted-foreground">最近同步</p><p className="mt-1 text-sm">{date(fund.latestSyncAt)} {fund.latestSyncError ? `· ${fund.latestSyncError}` : "· 数据正常"}</p></div><FundSyncButton fundId={fund.id} /></div></div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[10rem_minmax(0,1fr)] layout-mobile:grid-cols-1 layout-desktop:grid-cols-[10rem_minmax(0,1fr)]">
        <FundSectionNav ariaLabel="基金详情页内导航" items={[{ id: "performance", label: "业绩风险" }, { id: "capital", label: "规模资金" }, { id: "portfolio", label: "持仓变化" }, { id: "profile", label: "基金档案" }, { id: "managers", label: "基金经理" }, { id: "mandate", label: "投资风险" }, { id: "quality", label: "数据质量" }]} />
        <div className="grid min-w-0 gap-5">
          <div id="performance" className="grid scroll-mt-20 gap-5 lg:scroll-mt-6">

            <section className="min-w-0 overflow-hidden border border-border bg-card p-4 lg:p-6">
              <h2 className="text-xl font-semibold lg:text-2xl">业绩与风险</h2>
              <div className="mt-2 min-w-0"><DetailPerformanceChart primaryId={fund.id} primaryKind="fund" primaryName={fund.name ?? fund.code} primaryMarket={fund.market} points={fund.navSnapshots.map((point) => { const valuationDate = date(point.valuationDate); return { date: valuationDate, unitNav: point.unitNav, accumulatedNav: point.accumulatedNav, dailyReturn: point.dailyReturn, dividendAmount: dividendsByDate.get(valuationDate) ?? 0 }; })} managerTenures={fund.managerTenures.map((manager) => ({ managerName: manager.managerName, startDate: manager.startDate ? date(manager.startDate) : null, endDate: manager.endDate ? date(manager.endDate) : null }))} baselines={baselines.filter((item) => !(item.kind === "fund" && item.id === fund.id))} chartSingleColor={user.chartSingleColor} chartSeriesColors={user.chartSeriesColors} /></div>
            </section>
          </div>

      <ResponsiveDisclosure targetId="capital" title="规模与资金结构" summary={`${fund.scaleSnapshots.length} 个规模观测 · ${fund.flowSnapshots.length} 个申赎观测`}>
        <FundCapitalHistory scaleSnapshots={fund.scaleSnapshots} flowSnapshots={fund.flowSnapshots} holderSnapshots={fund.holderSnapshots} />
      </ResponsiveDisclosure>

      <ResponsiveDisclosure targetId="portfolio" title={fund.vehicleType === "ETF" ? "持仓与申赎清单" : "公开持仓与资产配置"} summary={`${fund.portfolioReports.length} 个报告期${fund.vehicleType === "ETF" ? ` · ${fund.etfPcfSnapshots.length} 个清单日期` : ""}`}>
        {fund.vehicleType === "ETF" ? <EtfPortfolioHistory fundId={fund.id} snapshots={fund.etfPcfSnapshots} selectedSnapshot={selectedPcfSnapshot} reports={fund.portfolioReports} selectedReport={selectedReport} /> : <FundPortfolioHistory fundId={fund.id} reports={fund.portfolioReports} selectedReport={selectedReport} />}
      </ResponsiveDisclosure>

      <div className="grid gap-5 lg:grid-cols-2">
        <ResponsiveDisclosure targetId="profile" title="基金档案" summary="基本信息 · 费率 · 跟踪标的">
        <section id="profile" className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6">
          <h2 className="text-2xl font-semibold">基金档案</h2>
          <h3 className="mt-5 border-b border-border pb-2 text-sm font-semibold">基本信息</h3>
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-4 text-sm">
            <ProfileField label="基金全称">{fund.fullName ?? "公开来源未披露"}</ProfileField><ProfileField label="基金公司">{fund.company ?? "公开来源未披露"}</ProfileField><ProfileField label="基金托管人">{fund.custodian ?? "公开来源未披露"}</ProfileField><ProfileField label="发行日期">{date(fund.issueDate)}</ProfileField><ProfileField label="成立日期">{date(fund.establishedDate)}</ProfileField><ProfileField label="成立规模">{fund.establishedShares === null || fund.establishedShares === undefined ? "公开来源未披露" : `${number(fund.establishedShares)} 亿份`}</ProfileField><ProfileField label="币种">{fund.currency ?? "公开来源未披露"}</ProfileField><ProfileField label="跟踪标的">{fund.trackingTarget ?? "公开来源未披露"}</ProfileField><ProfileField label="业绩基准">{fund.benchmarkDescription ?? "公开来源未披露"}</ProfileField>
          </dl>
          <h3 className="mt-6 border-b border-border pb-2 text-sm font-semibold">费率</h3>
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-4 text-sm"><ProfileField label="管理费率">{rate(fund.managementFeeRate)}</ProfileField><ProfileField label="托管费率">{rate(fund.custodianFeeRate)}</ProfileField><ProfileField label="销售服务费率">{rate(fund.salesServiceFeeRate)}</ProfileField></dl>
        </section>
        </ResponsiveDisclosure>
        <ResponsiveDisclosure targetId="managers" title="基金经理" summary={`${currentManagers.length} 位现任 · ${historicalManagers.length} 条历任记录`}>
        <section id="managers" className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6">
          <h2 className="text-2xl font-semibold">基金经理</h2>
          <h3 className="mt-5 text-sm font-semibold">现任经理</h3>
          <div className="mt-2 divide-y divide-border border-y border-border">{currentManagers.length ? currentManagers.map((manager) => <div key={manager.id} className="grid grid-cols-[1fr_auto] gap-3 py-4"><div><p className="font-medium">{manager.managerName}</p><p className="mt-1 text-xs text-muted-foreground">{date(manager.startDate)} — 至今</p></div><p className="text-sm">任职回报 {rate(manager.tenureReturn)}</p></div>) : <p className="py-5 text-sm text-muted-foreground">公开来源未披露现任经理。</p>}</div>
          <h3 className="mt-6 text-sm font-semibold">历任记录</h3>
          <div className="mt-2 max-h-[28rem] divide-y divide-border overflow-y-auto border-y border-border">{historicalManagers.length ? historicalManagers.map((manager) => <div key={manager.id} className="grid grid-cols-[1fr_auto] gap-3 py-4"><div><p className="font-medium">{manager.managerName}</p><p className="mt-1 text-xs text-muted-foreground">{date(manager.startDate)} — {date(manager.endDate)}</p></div><p className="text-sm">任职回报 {rate(manager.tenureReturn)}</p></div>) : <p className="py-5 text-sm text-muted-foreground">公开来源未披露历史任职记录。</p>}</div>
        </section>
        </ResponsiveDisclosure>
      </div>

      <ResponsiveDisclosure targetId="mandate" title="投资说明与风险" summary="目标 · 范围 · 策略 · 风险收益特征">
        <section id="mandate" className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6"><h2 className="text-2xl font-semibold">投资说明与风险</h2><div className="mt-5 grid gap-3 lg:grid-cols-2">{[["投资目标", fund.investmentObjective], ["投资范围", fund.investmentScope], ["投资策略", fund.investmentStrategy], ["分红政策", fund.dividendPolicy], ["风险收益特征", fund.riskReturnCharacteristics]].map(([label, value]) => <details key={label} className="border border-border bg-background p-4 open:lg:col-span-2"><summary className="cursor-pointer text-sm font-semibold">{label}</summary><p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">{value ?? "公开来源未披露"}</p></details>)}</div></section>
      </ResponsiveDisclosure>

          <ResponsiveDisclosure targetId="quality" title="数据来源与时效" summary={`${fund.sourceSnapshots.length} 个来源分区`}>
            <section id="quality" className="scroll-mt-20 border border-border bg-card p-5 lg:scroll-mt-6"><div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-2xl font-semibold">数据来源与时效</h2><a href={`https://fundf10.eastmoney.com/jjgg_${fund.code}.html`} target="_blank" rel="noreferrer" className="border border-border bg-background px-4 py-2 text-xs text-accent">基金公告来源 ↗</a></div><div className="mt-5 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">{fund.sourceSnapshots.map((source) => <div key={source.id} className="bg-background p-4"><p className="font-mono text-xs uppercase">{source.section}</p><p className="mt-2 text-xs text-muted-foreground">{sourceCoverage(source.section)}</p><p className="mt-1 text-xs text-muted-foreground">{date(source.fetchedAt)} · {source.error ? `失败：${source.error}` : new Date(source.expiresAt) <= new Date() ? "已过期" : "有效"}</p>{source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-accent underline underline-offset-4">查看公开来源</a> : null}</div>)}</div></section>
          </ResponsiveDisclosure>

        </div>
      </div>

    </AppShell>
  );
}

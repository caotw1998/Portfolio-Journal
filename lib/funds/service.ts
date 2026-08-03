import { Prisma, type Fund as StoredFund } from "@prisma/client";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { buildResearchComparison, type ResearchSeriesInput } from "@/lib/funds/comparison";
import { classifyFundIdentity } from "@/lib/funds/classification";
import { createEastmoneyFundProvider } from "@/lib/funds/providers/eastmoney";
import { fetchOfficialEtfPcf } from "@/lib/funds/providers/official-etf-pcf";
import { fetchStockIndustry } from "@/lib/funds/providers/stock-industry";
import type { ProviderResult } from "@/lib/funds/providers/types";
import { buildDividendAdjustedSeries, calculateSeriesMetrics } from "@/lib/funds/metrics";
import { rankFundSearchResults } from "@/lib/funds/search";

const provider = createEastmoneyFundProvider();
const DAY_MS = 24 * 60 * 60 * 1000;
const SECTION_TTL = {
  nav: 6 * 60 * 60 * 1000,
  profile: DAY_MS,
  managers: 7 * DAY_MS,
  portfolio: 7 * DAY_MS,
  scale: 7 * DAY_MS,
  flows: 7 * DAY_MS,
  holders: 30 * DAY_MS,
  pcf: 6 * 60 * 60 * 1000,
} as const;
type SyncSection = keyof typeof SECTION_TTL;

function isExchangeEtf(fund: { vehicleType: string | null; market: string }) {
  return fund.vehicleType === "ETF" && (fund.market === "SSE" || fund.market === "SZSE");
}

function sectionsForFund(fund: { vehicleType: string | null; market: string }) {
  const sections = (Object.keys(SECTION_TTL) as SyncSection[]).filter((section) => section !== "pcf");
  return isExchangeEtf(fund) ? [...sections, "pcf" as const] : sections;
}

function sourceForSection(section: SyncSection) {
  return section === "pcf" ? "official_exchange" : provider.source;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function decimal(value: number | null) {
  return value === null ? null : new Prisma.Decimal(value);
}

function optionalDecimal(value: number | null) {
  return value === null ? undefined : new Prisma.Decimal(value);
}

type Jsonified<T> = T extends Date
  ? string
  : T extends Prisma.Decimal
    ? number
    : T extends bigint
      ? number
      : T extends Array<infer Item>
        ? Jsonified<Item>[]
        : T extends object
          ? { [Key in keyof T]: Jsonified<T[Key]> }
          : T;

function serializeFund<T>(value: T): Jsonified<T> {
  if (value instanceof Date) return value.toISOString() as Jsonified<T>;
  if (value instanceof Prisma.Decimal) return value.toNumber() as Jsonified<T>;
  if (typeof value === "bigint") return Number(value) as Jsonified<T>;
  if (Array.isArray(value)) return value.map((item) => serializeFund(item)) as Jsonified<T>;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeFund(item)]),
    ) as Jsonified<T>;
  }
  return value as Jsonified<T>;
}

function buildFundPerformanceSeries(
  navSnapshots: Array<{ valuationDate: Date; unitNav: Prisma.Decimal; dailyReturn: Prisma.Decimal | null }>,
  dividendEvents: Array<{ exDate: Date | null; amount: Prisma.Decimal | null }>,
) {
  const dividendsByDate = new Map<string, number>();
  for (const event of dividendEvents) {
    if (!event.exDate || !event.amount) continue;
    const date = event.exDate.toISOString().slice(0, 10);
    dividendsByDate.set(date, (dividendsByDate.get(date) ?? 0) + event.amount.toNumber());
  }
  return buildDividendAdjustedSeries(navSnapshots.map((point) => {
    const date = point.valuationDate.toISOString().slice(0, 10);
    return {
      date,
      unitNav: point.unitNav.toNumber(),
      dailyReturn: point.dailyReturn?.toNumber() ?? null,
      dividendAmount: dividendsByDate.get(date) ?? 0,
    };
  }));
}

export async function searchFunds(query: string) {
  const normalized = query.trim();
  if (normalized.length < 2) {
    throw new ApiError("请输入至少 2 个字符。", 400);
  }
  const local = await prisma.fundCatalogEntry.findMany({
    where: { OR: [{ code: { contains: normalized } }, { name: { contains: normalized, mode: "insensitive" } }] },
    orderBy: [{ official: "desc" }, { code: "asc" }],
    take: 20,
  });
  const localResults = local.map((item) => ({
    code: item.code,
    name: item.name,
    market: classifyFundIdentity({ code: item.code, name: item.name, rawType: item.rawType ?? "fund", market: item.market }).market,
    type: item.rawType ?? "fund",
    currency: "CNY",
    source: item.source,
    establishedDate: null as string | null,
  }));
  let providerResults: Awaited<ReturnType<typeof provider.search>> = [];
  try {
    if (localResults.length) {
      providerResults = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve([]), 1_500);
        provider.search(normalized).then((results) => {
          clearTimeout(timeout);
          resolve(results);
        }, (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } else {
      providerResults = await provider.search(normalized);
    }
  } catch (error) {
    if (!localResults.length) throw error;
  }
  const resultsByKey = new Map(localResults.map((item) => [`${item.code}:${item.market}`, item]));
  for (const item of providerResults) resultsByKey.set(`${item.code}:${item.market}`, item);
  const knownFunds = await prisma.fund.findMany({
    where: { code: { in: Array.from(resultsByKey.values()).map((item) => item.code) } },
    select: { code: true, market: true, establishedDate: true },
  });
  for (const fund of knownFunds) {
    const key = `${fund.code}:${fund.market}`;
    const result = resultsByKey.get(key);
    if (result && !result.establishedDate && fund.establishedDate) {
      resultsByKey.set(key, { ...result, establishedDate: fund.establishedDate.toISOString().slice(0, 10) });
    }
  }
  const results = rankFundSearchResults(Array.from(resultsByKey.values()), normalized).slice(0, 20);
  await Promise.all(results.map((item) => prisma.fundCatalogEntry.upsert({
    where: { code_market: { code: item.code, market: item.market } },
    create: { code: item.code, market: item.market, name: item.name, rawType: item.type, source: item.source },
    update: { name: item.name, rawType: item.type, source: item.source },
  })));
  return results;
}

export async function listUserFunds(userId: string) {
  const rows = await prisma.userFund.findMany({
    where: { userId },
    select: {
      createdAt: true,
      researchStage: true,
      tags: true,
      categoryLinks: {
        orderBy: { category: { sortOrder: "asc" } },
        select: { categoryId: true },
      },
      nextReviewDate: true,
      fund: {
        select: {
          id: true, code: true, name: true, type: true, assetClass: true, managementStyle: true, vehicleType: true, market: true, company: true,
          managementFeeRate: true, custodianFeeRate: true, salesServiceFeeRate: true,
          latestSyncAt: true, latestSyncError: true,
          navSnapshots: { orderBy: { valuationDate: "asc" }, select: { valuationDate: true, unitNav: true, accumulatedNav: true, dailyReturn: true } },
          dividendEvents: { orderBy: { exDate: "asc" }, select: { exDate: true, amount: true } },
          scaleSnapshots: { orderBy: { reportDate: "desc" }, take: 2, select: { reportDate: true, netAssets: true } },
          managerTenures: { where: { endDate: null }, orderBy: { startDate: "asc" }, select: { managerName: true, startDate: true } },
          portfolioReports: { orderBy: { reportDate: "desc" }, take: 1, select: { reportDate: true, holdings: { where: { kind: "stock", rank: { lte: 10 } }, select: { weight: true } } } },
          sourceSnapshots: { select: { section: true, fetchedAt: true, expiresAt: true, error: true, status: true, asOfDate: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return serializeFund(rows.map((row) => {
    const nav = row.fund.navSnapshots;
    const metrics = calculateSeriesMetrics(buildFundPerformanceSeries(nav, row.fund.dividendEvents));
    const latestScale = row.fund.scaleSnapshots[0];
    const previousScale = row.fund.scaleSnapshots[1];
    const annualFeeParts = [row.fund.managementFeeRate, row.fund.custodianFeeRate, row.fund.salesServiceFeeRate];
    const disclosedAnnualFees = annualFeeParts.filter((fee): fee is Prisma.Decimal => fee !== null);
    const expectedSections = sectionsForFund(row.fund);
    const qualitySections = row.fund.sourceSnapshots.filter((source) => expectedSections.includes(source.section as SyncSection) && source.status === "success" && !source.error).length;
    return {
      id: row.fund.id,
      code: row.fund.code,
      name: row.fund.name,
      type: row.fund.type,
      assetClass: row.fund.assetClass,
      managementStyle: row.fund.managementStyle,
      company: row.fund.company,
      latestSyncAt: row.fund.latestSyncAt,
      latestSyncError: row.fund.latestSyncError,
      latestNav: nav.at(-1) ?? null,
      navSnapshots: nav.slice(-2).reverse(),
      metrics,
      latestScale: latestScale?.netAssets ?? null,
      scaleChange: latestScale?.netAssets && previousScale?.netAssets && !previousScale.netAssets.isZero()
        ? latestScale.netAssets.div(previousScale.netAssets).minus(1)
        : null,
      annualFees: {
        management: row.fund.managementFeeRate?.toNumber() ?? null,
        custodian: row.fund.custodianFeeRate?.toNumber() ?? null,
        salesService: row.fund.salesServiceFeeRate?.toNumber() ?? null,
        total: disclosedAnnualFees.length ? disclosedAnnualFees.reduce((sum, fee) => sum + fee.toNumber(), 0) : null,
        complete: disclosedAnnualFees.length === annualFeeParts.length,
      },
      currentManagers: row.fund.managerTenures,
      topTenConcentration: row.fund.portfolioReports[0]?.holdings.reduce((sum, holding) => sum + (holding.weight?.toNumber() ?? 0), 0) ?? null,
      portfolioAsOfDate: row.fund.portfolioReports[0]?.reportDate ?? null,
      dataQuality: { successfulSections: qualitySections, totalSections: expectedSections.length, score: qualitySections / expectedSections.length },
      sourceSnapshots: row.fund.sourceSnapshots,
      researchStage: row.researchStage,
      tags: row.tags,
      categoryIds: row.categoryLinks.map((link) => link.categoryId),
      nextReviewDate: row.nextReviewDate,
      followedAt: row.createdAt,
    };
  }));
}

async function requireUserFund(userId: string, fundId: string) {
  const row = await prisma.userFund.findUnique({
    where: { userId_fundId: { userId, fundId } },
    include: { fund: true },
  });
  if (!row) throw new ApiError("基金不存在或无权访问。", 404);
  return row.fund;
}

async function normalizeFundForSync(fund: StoredFund): Promise<StoredFund> {
  const classification = classifyFundIdentity({ code: fund.code, name: fund.name, rawType: fund.rawType ?? fund.type, market: fund.market });
  const unchanged = fund.market === classification.market
    && fund.assetClass === classification.assetClass
    && fund.managementStyle === classification.managementStyle
    && fund.vehicleType === classification.vehicleType
    && fund.investmentRegion === classification.investmentRegion
    && fund.shareClass === classification.shareClass;
  if (unchanged) return fund;
  if (classification.market !== fund.market) {
    const conflicting = await prisma.fund.findUnique({ where: { code_market: { code: fund.code, market: classification.market } }, select: { id: true } });
    if (conflicting && conflicting.id !== fund.id) throw new ApiError(`基金 ${fund.code} 已存在交易所市场记录，无法自动合并。`, 409);
  }
  return prisma.fund.update({
    where: { id: fund.id },
    data: {
      market: classification.market,
      type: classification.assetClass,
      assetClass: classification.assetClass,
      managementStyle: classification.managementStyle,
      vehicleType: classification.vehicleType,
      investmentRegion: classification.investmentRegion,
      shareClass: classification.shareClass,
    },
  });
}

async function storeSourceResult<T>(fundId: string, section: SyncSection, result: ProviderResult<T>) {
  const now = new Date();
  const source = sourceForSection(section);
  const items = Array.isArray(result.data) ? result.data : [result.data];
  const fields = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? Object.keys(result.data as object)
    : [];
  const rawJson = jsonValue({ recordCount: items.length, fields, coverage: result.coverage ?? null });
  const contentHash = createHash("sha256").update(JSON.stringify(result.data)).digest("hex");
  const missingFields = !Array.isArray(result.data) && result.data && typeof result.data === "object"
    ? Object.entries(result.data as object).filter(([, value]) => value === null).map(([key]) => key)
    : [];
  const pcfTradingDay = section === "pcf" && result.data && typeof result.data === "object" && !Array.isArray(result.data)
    && "tradingDay" in result.data && typeof result.data.tradingDay === "string"
    ? result.data.tradingDay
    : null;
  const asOfDate = pcfTradingDay
    ? new Date(`${pcfTradingDay}T00:00:00Z`)
    : result.coverage?.lastDate
    ? new Date(`${result.coverage.lastDate}T00:00:00Z`)
    : undefined;
  await prisma.fundSourceSnapshot.upsert({
    where: { fundId_source_section: { fundId, source, section } },
    create: {
      fundId,
      source,
      section,
      sourceUrl: result.sourceUrl,
      rawJson,
      asOfDate,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + SECTION_TTL[section]),
      status: "success",
      lastSuccessAt: now,
      lastAttemptAt: now,
      contentHash,
      missingFields: jsonValue(missingFields),
      coverageJson: result.coverage ? jsonValue(result.coverage) : undefined,
    },
    update: {
      sourceUrl: result.sourceUrl,
      rawJson,
      asOfDate,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + SECTION_TTL[section]),
      error: null,
      status: "success",
      lastSuccessAt: now,
      lastAttemptAt: now,
      failureCount: 0,
      contentHash,
      missingFields: jsonValue(missingFields),
      coverageJson: result.coverage ? jsonValue(result.coverage) : Prisma.JsonNull,
    },
  });
}

async function storeSourceError(fundId: string, section: SyncSection, error: unknown) {
  const message = error instanceof Error ? error.message : "未知采集错误";
  const now = new Date();
  const source = sourceForSection(section);
  await prisma.fundSourceSnapshot.upsert({
    where: { fundId_source_section: { fundId, source, section } },
    create: {
      fundId,
      source,
      section,
      rawJson: {},
      fetchedAt: now,
      expiresAt: now,
      error: message,
      status: "source_error",
      lastAttemptAt: now,
      failureCount: 1,
    },
    update: { error: message, status: "source_error", lastAttemptAt: now, failureCount: { increment: 1 }, fetchedAt: now, expiresAt: now },
  });
  return message;
}

async function shouldSync(fundId: string, section: SyncSection, force: boolean) {
  if (force) return true;
  const cache = await prisma.fundSourceSnapshot.findUnique({
    where: { fundId_source_section: { fundId, source: sourceForSection(section), section } },
    select: { expiresAt: true, error: true },
  });
  return !cache || Boolean(cache.error) || cache.expiresAt <= new Date();
}

async function syncSection(fundId: string, code: string, market: string, section: SyncSection) {
  if (section === "nav") {
    const latest = await prisma.fundNavSnapshot.findFirst({ where: { fundId }, orderBy: { valuationDate: "desc" }, select: { valuationDate: true } });
    const navSource = await prisma.fundSourceSnapshot.findUnique({
      where: { fundId_source_section: { fundId, source: provider.source, section: "nav" } },
      select: { coverageJson: true },
    });
    const previousCoverage = navSource?.coverageJson && typeof navSource.coverageJson === "object" && !Array.isArray(navSource.coverageJson)
      ? navSource.coverageJson as Record<string, unknown>
      : null;
    const dividendEventsComplete = previousCoverage?.dividendEventsComplete === true;
    const performanceAdjustmentCurrent = previousCoverage?.performanceAdjustmentVersion === 2;
    const refreshFrom = latest && dividendEventsComplete && performanceAdjustmentCurrent
      ? new Date(latest.valuationDate.getTime() - 7 * DAY_MS).toISOString().slice(0, 10)
      : undefined;
    const result = await provider.nav(code, refreshFrom);
    if (result.data.length === 0) throw new Error("未获取到基金净值。");
    if (result.coverage) {
      result.coverage = { ...result.coverage, dividendEventsComplete: dividendEventsComplete || !refreshFrom };
    }
    const replaceFrom = new Date(`${result.data[0]!.valuationDate}T00:00:00Z`);
    const dividendEvents = result.data.flatMap((point) => point.dividendAmount && point.dividendAmount > 0 ? [{
      fundId,
      exDate: new Date(`${point.valuationDate}T00:00:00Z`),
      amount: point.dividendAmount,
      description: `每份派现金${point.dividendAmount}元`,
      source: provider.source,
      sourceUrl: result.sourceUrl,
    }] : []);
    await prisma.$transaction(async (transaction) => {
      await transaction.fundNavSnapshot.deleteMany({ where: { fundId, valuationDate: { gte: replaceFrom } } });
      await transaction.fundNavSnapshot.createMany({
        data: result.data.map((point) => ({
          fundId,
          valuationDate: new Date(`${point.valuationDate}T00:00:00Z`),
          publishedAt: point.publishedAt ? new Date(point.publishedAt) : null,
          unitNav: point.unitNav,
          accumulatedNav: point.accumulatedNav,
          dailyReturn: point.dailyReturn,
          source: provider.source,
        })),
      });
      await transaction.fundDividendEvent.deleteMany({ where: { fundId, source: provider.source, exDate: { gte: replaceFrom } } });
      if (dividendEvents.length) await transaction.fundDividendEvent.createMany({ data: dividendEvents });
    });
    await storeSourceResult(fundId, section, result);
    return;
  }
  if (section === "profile") {
    const result = await provider.profile(code);
    await prisma.fund.update({
      where: { id: fundId },
      data: {
        fullName: result.data.fullName ?? undefined,
        company: result.data.company ?? undefined,
        custodian: result.data.custodian ?? undefined,
        issueDate: result.data.issueDate ? new Date(`${result.data.issueDate}T00:00:00Z`) : undefined,
        establishedDate: result.data.establishedDate ? new Date(`${result.data.establishedDate}T00:00:00Z`) : undefined,
        establishedShares: optionalDecimal(result.data.establishedShares),
        managementFeeRate: optionalDecimal(result.data.managementFeeRate),
        custodianFeeRate: optionalDecimal(result.data.custodianFeeRate),
        salesServiceFeeRate: optionalDecimal(result.data.salesServiceFeeRate),
        benchmarkDescription: result.data.benchmarkDescription ?? undefined,
        trackingTarget: result.data.trackingTarget ?? undefined,
        investmentObjective: result.data.investmentObjective ?? undefined,
        investmentScope: result.data.investmentScope ?? undefined,
        investmentStrategy: result.data.investmentStrategy ?? undefined,
        dividendPolicy: result.data.dividendPolicy ?? undefined,
        riskReturnCharacteristics: result.data.riskReturnCharacteristics ?? undefined,
        subscribeStatus: result.data.subscribeStatus ?? undefined,
        redeemStatus: result.data.redeemStatus ?? undefined,
      },
    });
    await storeSourceResult(fundId, section, result);
    return;
  }
  if (section === "managers") {
    const result = await provider.managers(code);
    if (result.data.length === 0) throw new Error("未获取到基金经理任职记录。");
    await prisma.$transaction([
      prisma.fundManagerTenure.deleteMany({ where: { fundId } }),
      prisma.fundManagerTenure.createMany({ data: result.data.map((manager) => ({
        fundId,
        managerName: manager.managerName,
        startDate: manager.startDate ? new Date(`${manager.startDate}T00:00:00Z`) : null,
        endDate: manager.endDate ? new Date(`${manager.endDate}T00:00:00Z`) : null,
        tenureReturn: decimal(manager.tenureReturn),
        source: provider.source,
        asOfDate: manager.asOfDate ? new Date(`${manager.asOfDate}T00:00:00Z`) : null,
      })) }),
    ]);
    await storeSourceResult(fundId, section, result);
    return;
  }
  if (section === "portfolio") {
    const hasReports = await prisma.fundPortfolioReport.count({ where: { fundId } });
    const result = await provider.portfolio(code, { fullHistory: hasReports === 0 });
    if (result.data.length === 0) throw new Error("未获取到基金持仓报告。");
    await prisma.$transaction(async (transaction) => {
      for (const portfolio of result.data) {
        const report = await transaction.fundPortfolioReport.upsert({
          where: { fundId_reportDate: { fundId, reportDate: new Date(`${portfolio.reportDate}T00:00:00Z`) } },
          create: {
            fundId,
            reportDate: new Date(`${portfolio.reportDate}T00:00:00Z`),
            stockPercent: decimal(portfolio.stockPercent),
            bondPercent: decimal(portfolio.bondPercent),
            cashPercent: decimal(portfolio.cashPercent),
            otherPercent: decimal(portfolio.otherPercent),
            industryJson: jsonValue(portfolio.industries),
            source: provider.source,
          },
          update: {
            stockPercent: decimal(portfolio.stockPercent),
            bondPercent: decimal(portfolio.bondPercent),
            cashPercent: decimal(portfolio.cashPercent),
            otherPercent: decimal(portfolio.otherPercent),
            industryJson: jsonValue(portfolio.industries),
            source: provider.source,
          },
        });
        await transaction.fundHolding.deleteMany({ where: { portfolioReportId: report.id } });
        if (portfolio.holdings.length) {
          await transaction.fundHolding.createMany({ data: portfolio.holdings.map((holding) => ({
            portfolioReportId: report.id,
            kind: holding.kind,
            rank: holding.rank,
            code: holding.code,
            name: holding.name,
            weight: decimal(holding.weight),
            quantity: decimal(holding.quantity),
            marketValue: decimal(holding.marketValue),
          })) });
        }
      }
    });
    const latestReport = await prisma.fundPortfolioReport.findFirst({ where: { fundId }, orderBy: { reportDate: "desc" }, select: { id: true } });
    if (latestReport) await enrichFundPortfolioReportIndustriesByFund(fundId, latestReport.id).catch(() => undefined);
    await storeSourceResult(fundId, section, result);
    return;
  }
  if (section === "scale") {
    const result = await provider.scale(code);
    if (result.data.length === 0) throw new Error("未获取到基金规模记录。");
    await prisma.$transaction(result.data.map((point) => prisma.fundScaleSnapshot.upsert({
      where: { fundId_reportDate: { fundId, reportDate: new Date(`${point.reportDate}T00:00:00Z`) } },
      create: { fundId, reportDate: new Date(`${point.reportDate}T00:00:00Z`), netAssets: decimal(point.netAssets), shares: decimal(point.shares), holderCount: point.holderCount === null ? null : BigInt(point.holderCount), source: provider.source },
      update: { netAssets: decimal(point.netAssets), shares: decimal(point.shares), holderCount: point.holderCount === null ? null : BigInt(point.holderCount), source: provider.source },
    })));
    await storeSourceResult(fundId, section, result);
    return;
  }
  if (section === "flows") {
    const result = await provider.flows(code);
    if (result.data.length === 0) throw new Error("未获取到基金申赎与份额记录。");
    await prisma.$transaction(result.data.map((point) => prisma.fundFlowSnapshot.upsert({
      where: { fundId_reportDate: { fundId, reportDate: new Date(`${point.reportDate}T00:00:00Z`) } },
      create: { fundId, reportDate: new Date(`${point.reportDate}T00:00:00Z`), subscriptions: decimal(point.subscriptions), redemptions: decimal(point.redemptions), totalShares: decimal(point.totalShares), source: provider.source },
      update: { subscriptions: decimal(point.subscriptions), redemptions: decimal(point.redemptions), totalShares: decimal(point.totalShares), source: provider.source },
    })));
    await storeSourceResult(fundId, section, result);
    return;
  }
  if (section === "pcf") {
    const result = await fetchOfficialEtfPcf(code, market);
    const point = result.data;
    await prisma.$transaction(async (transaction) => {
      const snapshot = await transaction.etfPcfSnapshot.upsert({
        where: { fundId_tradingDay: { fundId, tradingDay: new Date(`${point.tradingDay}T00:00:00Z`) } },
        create: {
          fundId,
          tradingDay: new Date(`${point.tradingDay}T00:00:00Z`),
          previousTradingDay: point.previousTradingDay ? new Date(`${point.previousTradingDay}T00:00:00Z`) : null,
          creationRedemptionUnit: decimal(point.creationRedemptionUnit),
          navPerCreationUnit: decimal(point.navPerCreationUnit),
          nav: decimal(point.nav),
          cashComponent: decimal(point.cashComponent),
          estimatedCashComponent: decimal(point.estimatedCashComponent),
          maxCashRatio: decimal(point.maxCashRatio),
          creationRedemptionStatus: point.creationRedemptionStatus,
          creationRedemptionMechanism: point.creationRedemptionMechanism,
          publishIopv: point.publishIopv,
          creationLimit: decimal(point.creationLimit),
          redemptionLimit: decimal(point.redemptionLimit),
          limitsJson: jsonValue(point.limits),
          source: "official_exchange",
          sourceUrl: result.sourceUrl,
        },
        update: {
          previousTradingDay: point.previousTradingDay ? new Date(`${point.previousTradingDay}T00:00:00Z`) : null,
          creationRedemptionUnit: decimal(point.creationRedemptionUnit),
          navPerCreationUnit: decimal(point.navPerCreationUnit),
          nav: decimal(point.nav),
          cashComponent: decimal(point.cashComponent),
          estimatedCashComponent: decimal(point.estimatedCashComponent),
          maxCashRatio: decimal(point.maxCashRatio),
          creationRedemptionStatus: point.creationRedemptionStatus,
          creationRedemptionMechanism: point.creationRedemptionMechanism,
          publishIopv: point.publishIopv,
          creationLimit: decimal(point.creationLimit),
          redemptionLimit: decimal(point.redemptionLimit),
          limitsJson: jsonValue(point.limits),
          source: "official_exchange",
          sourceUrl: result.sourceUrl,
        },
      });
      await transaction.etfPcfComponent.deleteMany({ where: { snapshotId: snapshot.id } });
      await transaction.etfPcfComponent.createMany({
        data: point.components.map((component) => ({
          snapshotId: snapshot.id,
          instrumentCode: component.instrumentCode,
          instrumentName: component.instrumentName,
          quantity: decimal(component.quantity),
          substitutionFlag: component.substitutionFlag,
          creationPremiumRate: decimal(component.creationPremiumRate),
          redemptionDiscountRate: decimal(component.redemptionDiscountRate),
          substitutionCashAmount: decimal(component.substitutionCashAmount),
          creationCashSubstitute: decimal(component.creationCashSubstitute),
          redemptionCashSubstitute: decimal(component.redemptionCashSubstitute),
          market: component.market,
        })),
      });
    });
    await storeSourceResult(fundId, section, result);
    return;
  }
  const result = await provider.holders(code);
  if (result.data.length === 0) throw new Error("未获取到基金持有人结构。");
  await prisma.$transaction(result.data.map((point) => prisma.fundHolderSnapshot.upsert({
    where: { fundId_reportDate: { fundId, reportDate: new Date(`${point.reportDate}T00:00:00Z`) } },
    create: { fundId, reportDate: new Date(`${point.reportDate}T00:00:00Z`), institutionPercent: decimal(point.institutionPercent), individualPercent: decimal(point.individualPercent), internalPercent: decimal(point.internalPercent), source: provider.source },
    update: { institutionPercent: decimal(point.institutionPercent), individualPercent: decimal(point.individualPercent), internalPercent: decimal(point.internalPercent), source: provider.source },
  })));
  await storeSourceResult(fundId, section, result);
}

async function syncSectionWithRetry(fundId: string, code: string, market: string, section: SyncSection) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await syncSection(fundId, code, market, section);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function syncFund(userId: string, fundId: string, force = false) {
  const fund = await normalizeFundForSync(await requireUserFund(userId, fundId));
  const sections = sectionsForFund(fund);
  const errors: string[] = [];
  for (const section of sections) {
    if (!(await shouldSync(fund.id, section, force))) continue;
    try {
      await syncSectionWithRetry(fund.id, fund.code, fund.market, section);
    } catch (error) {
      errors.push(`${section}: ${await storeSourceError(fund.id, section, error)}`);
    }
  }
  await prisma.fund.update({
    where: { id: fund.id },
    data: { latestSyncAt: new Date(), latestSyncError: errors.length ? errors.join("；") : null },
  });
  return getFundDetail(userId, fund.id);
}

export async function addUserFund(userId: string, codeInput: unknown) {
  if (typeof codeInput !== "string" || !/^\d{6}$/.test(codeInput.trim())) {
    throw new ApiError("请输入 6 位基金代码。", 400);
  }
  const code = codeInput.trim();
  const match = (await provider.search(code)).find((item) => item.code === code);
  if (!match) throw new ApiError("公开基金目录中未找到该基金。", 404);
  const classification = classifyFundIdentity({ code: match.code, name: match.name, rawType: match.type, market: match.market });
  const fund = await prisma.fund.upsert({
    where: { code_market: { code: match.code, market: classification.market } },
    create: { code: match.code, name: match.name, rawType: match.type, type: classification.assetClass, currency: match.currency, ...classification },
    update: { name: match.name, rawType: match.type, type: classification.assetClass, currency: match.currency, ...classification },
  });
  await prisma.userFund.upsert({
    where: { userId_fundId: { userId, fundId: fund.id } },
    create: { userId, fundId: fund.id },
    update: {},
  });
  if (match.market === "SSE" || match.market === "SZSE") {
    const now = new Date();
    try {
      const validation = await provider.officialValidation(match.code, match.market);
      await prisma.fundSourceSnapshot.upsert({
        where: { fundId_source_section: { fundId: fund.id, source: "official_exchange", section: "official_validation" } },
        create: { fundId: fund.id, source: "official_exchange", section: "official_validation", sourceUrl: validation.sourceUrl, rawJson: jsonValue(validation.raw), fetchedAt: now, expiresAt: new Date(now.getTime() + 7 * DAY_MS), error: validation.data.verified ? null : "官方列表未返回匹配记录。" },
        update: { sourceUrl: validation.sourceUrl, rawJson: jsonValue(validation.raw), fetchedAt: now, expiresAt: new Date(now.getTime() + 7 * DAY_MS), error: validation.data.verified ? null : "官方列表未返回匹配记录。" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "交易所校验失败。";
      await prisma.fundSourceSnapshot.upsert({
        where: { fundId_source_section: { fundId: fund.id, source: "official_exchange", section: "official_validation" } },
        create: { fundId: fund.id, source: "official_exchange", section: "official_validation", sourceUrl: match.market === "SSE" ? "https://etf.sse.com.cn/fundlist/" : "https://www.szse.cn/market/product/list/etfList/index.html", rawJson: {}, fetchedAt: now, expiresAt: now, error: message },
        update: { fetchedAt: now, expiresAt: now, error: message },
      });
    }
  }
  return syncFund(userId, fund.id);
}

export async function removeUserFund(userId: string, fundId: string) {
  await requireUserFund(userId, fundId);
  await prisma.userFund.delete({ where: { userId_fundId: { userId, fundId } } });
}

export async function updateUserFundResearch(userId: string, fundId: string, input: unknown) {
  await requireUserFund(userId, fundId);
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const allowedStages = new Set(["discover", "research", "watch", "portfolio"]);
  const researchStage = typeof record.researchStage === "string" && allowedStages.has(record.researchStage) ? record.researchStage : undefined;
  const tags = Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean).slice(0, 20) : undefined;
  if (Object.prototype.hasOwnProperty.call(record, "categoryIds") && !Array.isArray(record.categoryIds)) {
    throw new ApiError("基金分类必须是分类 ID 数组。", 400);
  }
  const categoryIds = Array.isArray(record.categoryIds)
    ? Array.from(new Set(record.categoryIds.filter((id): id is string => typeof id === "string" && Boolean(id))))
    : undefined;
  if (categoryIds && categoryIds.length > 20) throw new ApiError("单只基金最多加入 20 个分类。", 400);
  const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 4000) || null : undefined;
  const nextReviewDate = typeof record.nextReviewDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.nextReviewDate) ? new Date(`${record.nextReviewDate}T00:00:00Z`) : record.nextReviewDate === null ? null : undefined;
  if (categoryIds) {
    const ownedCategoryCount = await prisma.researchCategory.count({ where: { userId, id: { in: categoryIds } } });
    if (ownedCategoryCount !== categoryIds.length) throw new ApiError("包含不存在或无权使用的分类。", 403);
  }
  return serializeFund(await prisma.$transaction(async (transaction) => {
    const userFund = await transaction.userFund.update({
      where: { userId_fundId: { userId, fundId } },
      data: { researchStage, tags, thesis: text(record.thesis), keyRisks: text(record.keyRisks), nextReviewDate },
      select: { id: true },
    });
    if (categoryIds) {
      await transaction.userFundCategory.deleteMany({ where: { userFundId: userFund.id } });
      if (categoryIds.length) {
        await transaction.userFundCategory.createMany({ data: categoryIds.map((categoryId) => ({ userFundId: userFund.id, categoryId })) });
      }
    }
    return transaction.userFund.findUniqueOrThrow({
      where: { id: userFund.id },
      include: { categoryLinks: { select: { categoryId: true } } },
    });
  }));
}

export async function getFundDetail(userId: string, fundId: string) {
  await requireUserFund(userId, fundId);
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    include: {
      navSnapshots: { orderBy: { valuationDate: "asc" } },
      dividendEvents: { orderBy: { exDate: "asc" } },
      managerTenures: { orderBy: [{ endDate: "desc" }, { startDate: "desc" }] },
      portfolioReports: { orderBy: { reportDate: "desc" } },
      scaleSnapshots: { orderBy: { reportDate: "asc" } },
      flowSnapshots: { orderBy: { reportDate: "asc" } },
      holderSnapshots: { orderBy: { reportDate: "asc" } },
      sourceSnapshots: { orderBy: { section: "asc" }, select: { id: true, source: true, section: true, sourceUrl: true, asOfDate: true, fetchedAt: true, expiresAt: true, error: true, status: true, lastSuccessAt: true, lastAttemptAt: true, failureCount: true, missingFields: true, coverageJson: true } },
      etfPcfSnapshots: { orderBy: { tradingDay: "desc" }, take: 30 },
    },
  });
  if (!fund) throw new ApiError("基金不存在。", 404);
  return serializeFund(fund);
}

export async function getFundOverview(userId: string, fundId: string) {
  await requireUserFund(userId, fundId);
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    include: {
      navSnapshots: { orderBy: { valuationDate: "desc" }, take: 2 },
      managerTenures: { where: { endDate: null }, orderBy: { startDate: "asc" } },
      portfolioReports: { orderBy: { reportDate: "desc" }, take: 8, select: { id: true, reportDate: true, stockPercent: true, bondPercent: true, cashPercent: true, otherPercent: true } },
      scaleSnapshots: { orderBy: { reportDate: "desc" }, take: 8 },
      flowSnapshots: { orderBy: { reportDate: "desc" }, take: 8 },
      holderSnapshots: { orderBy: { reportDate: "desc" }, take: 8 },
      sourceSnapshots: { orderBy: { section: "asc" }, select: { id: true, source: true, section: true, sourceUrl: true, asOfDate: true, fetchedAt: true, expiresAt: true, error: true, status: true, lastSuccessAt: true, lastAttemptAt: true, failureCount: true, missingFields: true, coverageJson: true } },
    },
  });
  if (!fund) throw new ApiError("基金不存在。", 404);
  return serializeFund(fund);
}

export async function getFundNav(userId: string, fundId: string, from?: string, to?: string) {
  await requireUserFund(userId, fundId);
  const points = await prisma.fundNavSnapshot.findMany({
    where: { fundId, valuationDate: { gte: from ? new Date(`${from}T00:00:00Z`) : undefined, lte: to ? new Date(`${to}T00:00:00Z`) : undefined } },
    orderBy: { valuationDate: "asc" },
  });
  return serializeFund(points);
}

export async function getFundPortfolioReport(userId: string, fundId: string, reportId?: string) {
  await requireUserFund(userId, fundId);
  const report = await prisma.fundPortfolioReport.findFirst({
    where: { fundId, id: reportId },
    orderBy: { reportDate: "desc" },
    include: { holdings: { orderBy: [{ kind: "asc" }, { rank: "asc" }] } },
  });
  if (!report) throw new ApiError("该报告期暂无公开持仓。", 404);
  const previousReport = await prisma.fundPortfolioReport.findFirst({
    where: { fundId, reportDate: { lt: report.reportDate } },
    orderBy: { reportDate: "desc" },
    select: {
      reportDate: true,
      holdings: { orderBy: [{ kind: "asc" }, { rank: "asc" }] },
    },
  });
  const codes = Array.from(new Set([
    ...report.holdings,
    ...(previousReport?.holdings ?? []),
  ].flatMap((holding) => holding.kind === "stock" && holding.code ? [holding.code] : [])));
  const classifications = codes.length ? await prisma.stockIndustryClassification.findMany({
    where: { code: { in: codes }, industry: { not: null }, source: "csindex", taxonomy: "中证一级行业" },
    select: { code: true, industry: true, source: true },
  }) : [];
  const classificationByCode = new Map(classifications.map((item) => [item.code, item]));
  const attachIndustry = <T extends { code: string | null }>(holding: T) => ({
    ...holding,
    industry: holding.code ? classificationByCode.get(holding.code)?.industry ?? null : null,
    industrySource: holding.code ? classificationByCode.get(holding.code)?.source ?? null : null,
  });
  return serializeFund({
    ...report,
    holdings: report.holdings.map(attachIndustry),
    previousReportDate: previousReport?.reportDate ?? null,
    previousHoldings: (previousReport?.holdings ?? []).map(attachIndustry),
  });
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      if (item !== undefined) await worker(item);
    }
  }));
}

async function enrichFundPortfolioReportIndustriesByFund(fundId: string, reportId: string, fetchImpl: typeof fetch = fetch, force = false) {
  const report = await prisma.fundPortfolioReport.findFirst({
    where: { id: reportId, fundId },
    select: { holdings: { where: { kind: "stock", code: { not: null } }, select: { code: true, name: true } } },
  });
  if (!report) throw new ApiError("该报告期暂无公开持仓。", 404);
  const holdingsByCode = new Map(report.holdings.flatMap((holding) => holding.code && /^\d{6}$/.test(holding.code) ? [[holding.code, holding.name] as const] : []));
  const codes = Array.from(holdingsByCode.keys());
  const freshAfter = new Date(Date.now() - 180 * DAY_MS);
  const cached = codes.length ? await prisma.stockIndustryClassification.findMany({
    where: { code: { in: codes }, industry: { not: null }, source: "csindex", taxonomy: "中证一级行业", lastSuccessAt: { gte: freshAfter } },
    select: { code: true },
  }) : [];
  const cachedCodes = new Set(cached.map((item) => item.code));
  const pendingCodes = force ? codes : codes.filter((code) => !cachedCodes.has(code));
  await mapWithConcurrency(pendingCodes, 3, async (code) => {
    const attemptedAt = new Date();
    try {
      const result = await fetchStockIndustry(code, fetchImpl);
      await prisma.stockIndustryClassification.upsert({
        where: { code },
        create: { code, name: holdingsByCode.get(code), industry: result.industry, taxonomy: result.taxonomy, source: result.source, sourceUrl: result.sourceUrl, status: "active", lastAttemptAt: attemptedAt, lastSuccessAt: attemptedAt },
        update: { name: holdingsByCode.get(code), industry: result.industry, taxonomy: result.taxonomy, source: result.source, sourceUrl: result.sourceUrl, status: "active", lastAttemptAt: attemptedAt, lastSuccessAt: attemptedAt, lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "行业数据源不可用。";
      await prisma.stockIndustryClassification.upsert({
        where: { code },
        create: { code, name: holdingsByCode.get(code), status: "sync_error", lastAttemptAt: attemptedAt, lastError: message },
        update: { name: holdingsByCode.get(code), industry: null, taxonomy: null, source: null, sourceUrl: null, status: "sync_error", lastAttemptAt: attemptedAt, lastSuccessAt: null, lastError: message },
      });
    }
  });
  return prisma.stockIndustryClassification.findMany({
    where: { code: { in: codes } },
    select: { code: true, industry: true, source: true, taxonomy: true, status: true, lastError: true },
    orderBy: { code: "asc" },
  });
}

export async function enrichFundPortfolioReportIndustries(userId: string, fundId: string, reportId: string, fetchImpl: typeof fetch = fetch, force = false) {
  await requireUserFund(userId, fundId);
  return enrichFundPortfolioReportIndustriesByFund(fundId, reportId, fetchImpl, force);
}

export async function getEtfPcfSnapshot(userId: string, fundId: string, snapshotId?: string) {
  await requireUserFund(userId, fundId);
  const snapshot = await prisma.etfPcfSnapshot.findFirst({
    where: { fundId, id: snapshotId },
    orderBy: { tradingDay: "desc" },
    include: { components: { orderBy: [{ substitutionFlag: "asc" }, { instrumentCode: "asc" }] } },
  });
  return snapshot ? serializeFund(snapshot) : null;
}

export async function syncAllFunds(userId: string, force = false) {
  const followedFunds = await prisma.userFund.findMany({ where: { userId }, include: { fund: true } });
  const funds = await Promise.all(followedFunds.map(async (row) => ({ fundId: row.fundId, fund: await normalizeFundForSync(row.fund) })));
  const requestedItems = funds.flatMap((row) => sectionsForFund(row.fund).map((section) => ({ fundId: row.fundId, section })));
  const requestedSections = Array.from(new Set(requestedItems.map((item) => item.section)));
  const run = await prisma.fundSyncRun.create({
    data: { userId, status: "running", requestedSections, startedAt: new Date(), items: { create: requestedItems } },
  });
  const results = [];
  try {
    for (let index = 0; index < funds.length; index += 2) {
      const batch = funds.slice(index, index + 2);
      results.push(...await Promise.all(batch.map(async (row) => {
        const result = await syncFund(userId, row.fundId, force);
        const fundSections = sectionsForFund(row.fund);
        const sources = await prisma.fundSourceSnapshot.findMany({ where: { fundId: row.fundId, section: { in: fundSections } }, select: { section: true, error: true } });
        await Promise.all(fundSections.map((section) => {
          const source = sources.find((item) => item.section === section);
          return prisma.fundSyncRunItem.update({ where: { syncRunId_fundId_section: { syncRunId: run.id, fundId: row.fundId, section } }, data: { status: source?.error ? "failed" : "completed", attemptCount: 1, error: source?.error ?? null, completedAt: new Date() } });
        }));
        return result;
      })));
    }
    const failed = await prisma.fundSyncRunItem.count({ where: { syncRunId: run.id, status: "failed" } });
    await prisma.fundSyncRun.update({ where: { id: run.id }, data: { status: failed ? "partial" : "completed", completedAt: new Date() } });
  } catch (error) {
    await prisma.fundSyncRun.update({ where: { id: run.id }, data: { status: "failed", completedAt: new Date() } });
    throw error;
  }
  return { runId: run.id, results };
}

export async function getFundSyncRun(userId: string, runId: string) {
  const run = await prisma.fundSyncRun.findFirst({ where: { id: runId, userId }, include: { items: { orderBy: [{ status: "asc" }, { section: "asc" }] } } });
  if (!run) throw new ApiError("同步任务不存在。", 404);
  return serializeFund(run);
}

export async function compareResearchSeries(input: {
  userId: string;
  fundIds: string[];
  benchmarkId: string;
  from?: string;
  to?: string;
}) {
  const fundIds = Array.from(new Set(input.fundIds));
  if (fundIds.length < 1 || fundIds.length > 5) throw new ApiError("请选择 1 至 5 只基金。", 400);
  const followed = await prisma.userFund.findMany({ where: { userId: input.userId, fundId: { in: fundIds } }, select: { fundId: true } });
  if (followed.length !== fundIds.length) throw new ApiError("包含无权访问的基金。", 403);
  const benchmark = await prisma.benchmarkInstrument.findFirst({
    where: { id: input.benchmarkId, userId: input.userId },
    include: { priceSnapshots: { where: { date: { gte: input.from ? new Date(`${input.from}T00:00:00Z`) : undefined, lte: input.to ? new Date(`${input.to}T00:00:00Z`) : undefined } }, orderBy: { date: "asc" } } },
  });
  if (!benchmark) throw new ApiError("指数不存在或无权访问。", 404);
  const funds = await prisma.fund.findMany({
    where: { id: { in: fundIds } },
    include: {
      navSnapshots: { where: { valuationDate: { gte: input.from ? new Date(`${input.from}T00:00:00Z`) : undefined, lte: input.to ? new Date(`${input.to}T00:00:00Z`) : undefined } }, orderBy: { valuationDate: "asc" } },
      dividendEvents: { where: { exDate: { gte: input.from ? new Date(`${input.from}T00:00:00Z`) : undefined, lte: input.to ? new Date(`${input.to}T00:00:00Z`) : undefined } }, orderBy: { exDate: "asc" } },
    },
  });
  const series: ResearchSeriesInput[] = funds.map((fund) => {
    return {
      id: fund.id,
      kind: "fund",
      name: fund.name ?? fund.code,
      code: fund.code,
      basis: "dividend_reinvested",
      points: buildFundPerformanceSeries(fund.navSnapshots, fund.dividendEvents),
    };
  });
  series.push({
    id: benchmark.id,
    kind: "benchmark",
    name: benchmark.priceSnapshots[0]?.source === "proxy_etf_515450" ? `${benchmark.name}（515450 ETF 代理）` : benchmark.name,
    code: benchmark.code,
    basis: "close",
    points: benchmark.priceSnapshots.map((point) => ({ date: point.date.toISOString().slice(0, 10), value: point.closeValue.toNumber() })),
  });
  const comparison = buildResearchComparison(series);
  return comparison;
}

export type DetailSeriesKind = "fund" | "benchmark";

export async function listDetailBaselineOptions(userId: string) {
  const [fundRows, benchmarkRows] = await Promise.all([
    prisma.userFund.findMany({
      where: { userId, fund: { navSnapshots: { some: {} } } },
      select: { fund: { select: { id: true, code: true, name: true, market: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.benchmarkInstrument.findMany({
      where: { userId, status: "active", priceSnapshots: { some: {} } },
      select: {
        id: true, code: true, name: true, market: true,
        priceSnapshots: { orderBy: { date: "desc" }, take: 1, select: { source: true } },
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return [
    ...fundRows.map(({ fund }) => ({ id: fund.id, kind: "fund" as const, code: fund.code, name: fund.name ?? fund.code, market: fund.market, dataBasisLabel: null })),
    ...benchmarkRows.map((benchmark) => ({
      id: benchmark.id,
      kind: "benchmark" as const,
      code: benchmark.code,
      name: benchmark.name,
      market: benchmark.market,
      dataBasisLabel: benchmark.priceSnapshots[0]?.source === "proxy_etf_515450" ? "515450 ETF 代理" : null,
    })),
  ];
}

async function loadDetailSeries(input: {
  userId: string;
  kind: DetailSeriesKind;
  id: string;
  from?: string;
  to?: string;
}): Promise<ResearchSeriesInput> {
  const dateRange = {
    gte: input.from ? new Date(`${input.from}T00:00:00Z`) : undefined,
    lte: input.to ? new Date(`${input.to}T00:00:00Z`) : undefined,
  };
  if (input.kind === "fund") {
    const followed = await prisma.userFund.findUnique({
      where: { userId_fundId: { userId: input.userId, fundId: input.id } },
      select: {
        fund: {
          select: {
            id: true, code: true, name: true,
            navSnapshots: { where: { valuationDate: dateRange }, orderBy: { valuationDate: "asc" } },
            dividendEvents: { where: { exDate: dateRange }, orderBy: { exDate: "asc" } },
          },
        },
      },
    });
    if (!followed) throw new ApiError("基金不存在或无权访问。", 404);
    return {
      id: followed.fund.id,
      kind: "fund",
      name: followed.fund.name ?? followed.fund.code,
      code: followed.fund.code,
      basis: "dividend_reinvested",
      points: buildFundPerformanceSeries(followed.fund.navSnapshots, followed.fund.dividendEvents),
    };
  }
  const benchmark = await prisma.benchmarkInstrument.findFirst({
    where: { id: input.id, userId: input.userId },
    select: {
      id: true, code: true, name: true,
      priceSnapshots: { where: { date: dateRange }, orderBy: { date: "asc" } },
    },
  });
  if (!benchmark) throw new ApiError("指数不存在或无权访问。", 404);
  return {
    id: benchmark.id,
    kind: "benchmark",
    name: benchmark.priceSnapshots[0]?.source === "proxy_etf_515450" ? `${benchmark.name}（515450 ETF 代理）` : benchmark.name,
    code: benchmark.code,
    basis: "close",
    points: benchmark.priceSnapshots.map((point) => ({ date: point.date.toISOString().slice(0, 10), value: point.closeValue.toNumber() })),
  };
}

export async function compareDetailSeries(input: {
  userId: string;
  primaryKind: DetailSeriesKind;
  primaryId: string;
  baselineKind: DetailSeriesKind;
  baselineId: string;
  from?: string;
  to?: string;
}) {
  if (input.primaryKind === input.baselineKind && input.primaryId === input.baselineId) {
    throw new ApiError("主标的不能同时作为自己的基准。", 400);
  }
  const series = await Promise.all([
    loadDetailSeries({ userId: input.userId, kind: input.primaryKind, id: input.primaryId, from: input.from, to: input.to }),
    loadDetailSeries({ userId: input.userId, kind: input.baselineKind, id: input.baselineId, from: input.from, to: input.to }),
  ]);
  return buildResearchComparison(series);
}
